# infra/ — Terraform (AWS)

Infrastructure-as-Code for the task-tracker AWS deployment. Terraform runs
locally and provisions resources via the AWS API; nothing here runs in the cloud.

> Keep this file current as the configuration grows — it is the runbook for
> operating this directory.

## What this manages

Increment 1 (current):

- **AWS provider** — `hashicorp/aws ~> 5.0`, region from `var.region` (default `us-east-1`).
- **Security group** — attached to the account's **default VPC** (read via a data
  source, not created). Ingress: SSH (22) from `var.ssh_ingress_cidr` only, HTTP/HTTPS
  (80/443) open. Egress: all.

Planned: key pair (increment 2), EC2 instance + Elastic IP (increment 3).

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

## Files

| File | Purpose |
|------|---------|
| `versions.tf` | Terraform + AWS provider version pins, provider config |
| `variables.tf` | Input variable declarations |
| `main.tf` | Resources (default-VPC data source, security group) |
| `outputs.tf` | Outputs (security group id, VPC id) |
| `terraform.tfvars.example` | Template for `terraform.tfvars` |

## State

State is **local** (`terraform.tfstate` in this directory) and **gitignored** — it
contains resource attributes (and potentially secrets) in plaintext. A remote
backend (S3 + DynamoDB) is deferred until a second machine or collaborator needs it.
