# Pins Terraform itself and the AWS provider plugin. The terraform block is
# evaluated before anything else — `terraform init` reads it to know which
# provider to download. The .terraform.lock.hcl it generates IS committed
# (reproducible installs); the .terraform/ cache it downloads into is not.
terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# The provider block configures the AWS plugin. Credentials are NOT set here —
# the provider resolves them from the standard AWS credential chain (env vars,
# shared config/credentials files, SSO). See infra/README.md for auth setup,
# including the `aws login` -> credential_process bridge. Region from a variable.
provider "aws" {
  region = var.region
}
