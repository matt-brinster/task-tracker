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
