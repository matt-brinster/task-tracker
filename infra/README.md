# infra/ — Terraform (AWS)

Infrastructure-as-Code for the task-tracker AWS deployment. Terraform runs
locally and provisions resources via the AWS API; nothing here runs in the cloud.

> Keep this file current as the configuration grows — it is the runbook for
> operating this directory.

## What this manages

Current:

- **AWS provider** — `hashicorp/aws ~> 5.0`, region from `var.region` (default `us-east-1`).
- **Security group** — attached to the account's **default VPC** (read via a data
  source, not created). Ingress: SSH (22) from `var.ssh_ingress_cidr` only, HTTP/HTTPS
  (80/443) open. Egress: all.
- **SSH key pair** — uploads the *public* key at `var.ssh_public_key_path`. The private
  key is generated locally (see Setup) and never enters Terraform state.
- **EC2 instance** — latest Ubuntu 24.04 (looked up via an AMI data source),
  `var.instance_type` (default `t3.micro`), with the security group, key pair, and
  instance role attached and a `var.root_volume_gb` gp3 root disk. **Self-provisions
  on first boot** via `user_data` (see *First-boot provisioning* below) — installs
  Docker, reads `MONGO_URI` from SSM, and runs the app from its GHCR image.
- **IAM instance role + profile** (`${project}-ec2`) — lets the box authenticate
  to AWS services as itself using temporary, auto-rotating credentials from the
  instance metadata service (no access keys on disk). The role's trust policy
  allows only the EC2 service to assume it; permissions policies (SSM read, ECR
  pull) are attached in later increments. The instance profile is the wrapper that
  attaches the role to the instance.
- **Elastic IP** — stable public IP attached to the instance (SSH target / DNS value).

After `apply`, SSH in with:

```bash
ssh -i ~/.ssh/task-tracker ubuntu@"$(terraform output -raw instance_public_ip)"
```

## First-boot provisioning (`user_data`)

The instance provisions itself on first boot from [`user_data.sh.tftpl`](user_data.sh.tftpl),
rendered by `templatefile()` (which injects the region, SSM parameter name, and compose URL).
cloud-init runs the script once, as root, on the instance's first boot. It:

1. installs Docker from Docker's official apt repo (+ the compose plugin) and the AWS CLI;
2. reads `MONGO_URI` from SSM (`--with-decryption`, authenticating as the instance role via
   the metadata service — no credentials on disk) and writes it to a root-only
   `/opt/task-tracker/.env`;
3. fetches `docker-compose.prod.yml` from the public repo (`var.compose_url`, defaulting to
   `main`) — a small app-only compose that pulls the GHCR image and reads env from `.env`;
4. `docker compose pull && up -d`.

**Lifecycle:** cloud-init runs `user_data` **only on first boot** — editing the script does
nothing to a live box. `user_data_replace_on_change = true` makes Terraform **replace the
instance** when the rendered script changes (a fresh boot is the only way to re-run it). The
Elastic IP is a separate resource and re-associates to the replacement, so the public/egress
IP is stable across replaces. (A full `terraform destroy` **does** release the EIP — see
*State* / the "don't destroy" note.)

**Ordering:** because the box fetches the compose from `main`, that file must be on `main`
before a box boots — **merge first, then apply**. To test from a feature branch pre-merge,
override `compose_url` in `terraform.tfvars` to the branch's raw URL.

**Verify after boot** (SSH in):

```bash
tail -n 50 /var/log/user-data.log                                   # provisioning trace
docker compose -f /opt/task-tracker/docker-compose.prod.yml ps      # app container up?
curl -s localhost:3000/healthz                                      # expect {"status":"ok"}
```

If the container is stuck **Restarting** with Mongo connection errors in `docker compose logs`,
the usual cause is a missing Atlas allowlist entry — see *Setup → Atlas network access*.

## Setup

Generate the SSH key pair before the first `apply` (the key pair resource reads the
public key off disk):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/task-tracker -C "task-tracker-deploy"
```

This writes `~/.ssh/task-tracker` (private — keep it) and `~/.ssh/task-tracker.pub`
(public — uploaded by Terraform). Override the path via `ssh_public_key_path` if you
keep it elsewhere.

### Secrets — create the `MONGO_URI` SSM parameter (out-of-band)

The app's MongoDB connection string lives in **SSM Parameter Store** as a SecureString.
Terraform **intentionally does not create it** — the instance role is granted *read*
access to it, but the secret value never enters Terraform state. So it must exist before
the box tries to read it. Create it once, by hand, per account/region:

| Field | Value |
|-------|-------|
| Name  | `/task-tracker/prod/MONGO_URI` (the IAM read-grant is scoped to this exact ARN) |
| Tier  | Standard |
| Type  | **SecureString** |
| KMS key | `alias/aws/ssm` (the free AWS-managed key) |
| Value | the Atlas connection string, **including** the database path (Atlas's Connect dialog omits it; the app fails loud at startup without it) |

**Console:** Systems Manager → Parameter Store → Create parameter, with the values above.

**CLI:**

```bash
aws ssm put-parameter \
  --name "/task-tracker/prod/MONGO_URI" \
  --type SecureString \
  --key-id alias/aws/ssm \
  --value "mongodb+srv://…/task-tracker?…"
```

Note: the CLI form leaves the secret in your shell history — prefer the console, or read
the value from a file / a shell configured to ignore space-prefixed commands.

**Rotation:** re-running `put-parameter` with `--overwrite` updates the *parameter only* —
a live box does **not** pick it up. The box reads SSM once, at first boot, and freezes the
value into `/opt/task-tracker/.env`. To propagate a rotated value:

1. **Replace the instance** (canonical, no SSH): `terraform apply -replace=aws_instance.app`.
   The fresh boot re-reads SSM. Costs a few minutes of downtime — usually acceptable, since
   rotation typically means the old Atlas credential is being revoked anyway.
2. **Refresh in place** (SSH, container-restart downtime only): re-run the same read the boot
   script performs — the box has the AWS CLI and the instance role, so no credentials or
   hand-typed secrets are involved:

   ```bash
   MONGO_URI=$(aws ssm get-parameter --name "/task-tracker/prod/MONGO_URI" \
     --with-decryption --region us-east-1 --query Parameter.Value --output text)
   umask 077 && printf 'MONGO_URI=%s\n' "$MONGO_URI" | sudo tee /opt/task-tracker/.env >/dev/null
   docker compose -f /opt/task-tracker/docker-compose.prod.yml up -d
   ```

   Compose v2 includes `env_file` contents in the service's config hash, so `up -d` detects
   the change and recreates the container.

### Atlas network access — allowlist the Elastic IP

Atlas rejects connections from IPs not on its **Network Access** allowlist, and the app
**fails hard without Atlas**: startup runs `ensureIndexes()` before listening, so a blocked
connection means the process exits and Docker's restart policy loops it — the box looks fully
provisioned (`user-data.log` ends cleanly) while the app never comes up.

After the first `apply`, add the instance's Elastic IP:

- **Atlas:** Security → Network Access → Add IP Address → `terraform output -raw instance_public_ip`, as a `/32`.

Ordering note: the EIP only exists *after* the first `apply`, so on a brand-new deployment the
app will crash-loop for the minute or two until the allowlist entry is added and becomes
active. That's expected and self-healing — the restart policy keeps retrying, and the first
restart after the entry activates connects fine. The EIP is stable across instance
replacements, so this is a **one-time step per deployment** — it only needs redoing if the EIP
is released (`terraform destroy` — see the *State* note) and recreated with a new address.

## Prerequisites

- Terraform `>= 1.9`
- AWS CLI v2
- AWS credentials reachable by the AWS SDK (see **Authentication** below)

## Authentication

The AWS provider resolves credentials from the standard AWS credential chain:
environment variables, the shared config/credentials files, or SSO. Any method
that populates that chain works.

### `aws login` users (CLI v2.32+)

`aws login` stores credentials under a `login_session` directive in
`~/.aws/config`. The AWS CLI understands this format, but the Terraform AWS
provider (AWS SDK for Go) does **not** yet
([terraform-provider-aws#45316](https://github.com/hashicorp/terraform-provider-aws/issues/45316)).
Running Terraform directly against a `login_session` profile fails with
`No valid credential sources found`.

Bridge it with a `credential_process` profile in `~/.aws/config` that shells out
to the CLI (which *does* read `login_session`) and emits process-format creds:

```ini
[profile terraform]
credential_process = aws configure export-credentials --profile default --format process
region = us-east-1
```

Then select that profile when running Terraform:

```bash
export AWS_PROFILE=terraform
```

When the `aws login` session expires, re-run `aws login` — no config change needed;
`credential_process` re-runs on each Terraform invocation and picks up fresh creds.

## Usage

```bash
cd infra
export AWS_PROFILE=terraform     # if using the aws login bridge above

terraform init      # one-time: download provider, write .terraform.lock.hcl
terraform plan      # preview changes (read-only)
terraform apply     # create/update resources
terraform destroy   # tear everything down
```

## Inputs

Set in `terraform.tfvars` (gitignored). Copy `terraform.tfvars.example` to start.

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `ssh_ingress_cidr` | yes | — | Your public IP as `/32` for SSH access |
| `region` | no | `us-east-1` | |
| `project` | no | `task-tracker` | Name/tag prefix |
| `ssh_public_key_path` | no | `~/.ssh/task-tracker.pub` | Public key uploaded to the key pair |
| `instance_type` | no | `t3.micro` | EC2 size (smallest Free-Plan-eligible) |
| `root_volume_gb` | no | `12` | Root EBS volume size (GiB); inside the 30 GiB EBS free tier |
| `mongo_uri_ssm_parameter_name` | no | `/task-tracker/prod/MONGO_URI` | SSM SecureString the box reads at boot (IAM read-grant scoped to this exact name). Must start with `/` — enforced by a plan-time validation |
| `compose_url` | no | GHCR-repo `main` raw URL | Prod compose the box fetches at first boot; override to a feature branch to test pre-merge |

## Files

| File | Purpose |
|------|---------|
| `versions.tf` | Terraform + AWS provider version pins, provider config |
| `variables.tf` | Input variable declarations |
| `main.tf` | Resources (default-VPC + AMI data sources, security group, key pair, instance, EIP) |
| `iam.tf` | IAM instance role + profile the EC2 box assumes at runtime; SSM read-grant |
| `user_data.sh.tftpl` | First-boot provisioning script (bash), rendered by `templatefile()` |
| `outputs.tf` | Outputs (SG id, VPC id, key pair name, instance id, public IP) |
| `terraform.tfvars.example` | Template for `terraform.tfvars` |

The prod compose the box fetches, [`docker-compose.prod.yml`](../docker-compose.prod.yml), lives
at the **repo root** (not here) — it's platform-neutral app topology, not AWS infra.

## State

State is **local** (`terraform.tfstate` in this directory) and **gitignored** — it
contains resource attributes (and potentially secrets) in plaintext. A remote
backend (S3 + DynamoDB) is deferred until a second machine or collaborator needs it.
