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
  `var.instance_type` (default `t3.micro`), with the security group and key pair
  attached and a `var.root_volume_gb` gp3 root disk. Bare image; no `user_data` —
  provisioned manually over SSH.
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

## Setup

Generate the SSH key pair before the first `apply` (the key pair resource reads the
public key off disk):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/task-tracker -C "task-tracker-deploy"
```

This writes `~/.ssh/task-tracker` (private — keep it) and `~/.ssh/task-tracker.pub`
(public — uploaded by Terraform). Override the path via `ssh_public_key_path` if you
keep it elsewhere.

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
| `root_volume_gb` | no | `20` | Root EBS volume size (GiB) |

## Files

| File | Purpose |
|------|---------|
| `versions.tf` | Terraform + AWS provider version pins, provider config |
| `variables.tf` | Input variable declarations |
| `main.tf` | Resources (default-VPC data source, security group, key pair, instance, EIP) |
| `iam.tf` | IAM instance role + profile the EC2 box assumes at runtime |
| `outputs.tf` | Outputs (security group id, VPC id) |
| `terraform.tfvars.example` | Template for `terraform.tfvars` |

## State

State is **local** (`terraform.tfstate` in this directory) and **gitignored** — it
contains resource attributes (and potentially secrets) in plaintext. A remote
backend (S3 + DynamoDB) is deferred until a second machine or collaborator needs it.
