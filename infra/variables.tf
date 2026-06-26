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
  description = "Root EBS volume size (GiB). Larger than the AMI's 8 GiB default for build-on-box headroom."
  type        = number
  default     = 20
}
