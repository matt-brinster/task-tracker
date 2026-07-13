# Input variables. Values come from terraform.tfvars (gitignored) or -var flags.
# Declaring them here makes them typed and documented; tfvars supplies the data.

variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "ssh_ingress_cidr" {
  description = "CIDR allowed to reach SSH (port 22). Set to your home IP as a /32. Home IPs change, so this is a variable rather than hard-coded."
  type        = string
}

variable "project" {
  description = "Name prefix / tag applied to resources."
  type        = string
  default     = "task-tracker"
}

variable "ssh_public_key_path" {
  description = "Path to the PUBLIC half of the SSH key to install on the instance. Generate with: ssh-keygen -t ed25519 -f ~/.ssh/task-tracker. Public keys are not secret; the private key stays on your machine and never enters Terraform state."
  type        = string
  default     = "~/.ssh/task-tracker.pub"
}

variable "instance_type" {
  description = "EC2 instance type. t3.micro is the smallest Free-Plan-eligible size."
  type        = string
  default     = "t3.micro"
}

variable "root_volume_gb" {
  description = "Root EBS volume size (GiB). A modest bump over the AMI's 8 GiB floor for Docker image/layer/log headroom — the app image is small and Atlas holds the data off-box, so we no longer need build-on-box space. Well inside the 30 GiB EBS free-tier allowance (so any value here is $0)."
  type        = number
  default     = 12
}

variable "compose_url" {
  description = "Raw URL of the production compose file the instance fetches at first boot. Points at the public repo's main branch so the box always pulls the current prod topology — consistent with the :latest image tag it runs. Override via tfvars to test from a feature branch before merge."
  type        = string
  default     = "https://raw.githubusercontent.com/matt-brinster/task-tracker/main/docker-compose.prod.yml"
}

variable "mongo_uri_ssm_parameter_name" {
  description = "Name of the SSM Parameter Store SecureString holding MONGO_URI. Created OUT-OF-BAND (console or `aws ssm put-parameter`), never by Terraform — the secret must not enter TF state. The instance role is granted read access to this exact name; see README Setup → Secrets."
  type        = string
  default     = "/task-tracker/prod/MONGO_URI"

  # iam.tf builds the parameter's ARN as `parameter${this}` — the name's leading
  # slash doubles as the ARN separator. SSM also allows simple names (`MONGO_URI`,
  # no slash), which would concatenate into a malformed ARN that the read-grant
  # never matches, while `aws ssm get-parameter --name` happily accepts either
  # form — an AccessDenied surfacing only at first boot. Reject that at plan time.
  validation {
    condition     = startswith(var.mongo_uri_ssm_parameter_name, "/")
    error_message = "Must start with '/' (e.g. \"/task-tracker/prod/MONGO_URI\") — iam.tf's ARN construction and the SSM ARN format require the fully-qualified hierarchical form."
  }
}
