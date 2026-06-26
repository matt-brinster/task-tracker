# A fresh AWS account ships with a default VPC in every region. A data source
# READS something that already exists (vs. a resource, which CREATES). We look
# up the default VPC so the security group has a network to attach to — without
# us provisioning VPC infrastructure yet.
data "aws_vpc" "default" {
  default = true
}

# Latest Ubuntu 24.04 (noble) AMI published by Canonical. Looking it up at plan
# time (rather than hardcoding an ami-... id) keeps the config region-portable
# and always on the current patched image. owners = Canonical's AWS account id.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd*/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

# A security group is a stateful virtual firewall: ingress = what's allowed IN,
# egress = what's allowed OUT. Return
# traffic for an allowed inbound connection is permitted automatically.
resource "aws_security_group" "app" {
  name        = "${var.project}-sg"
  description = "task-tracker: SSH from home, HTTP/HTTPS from anywhere"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH from home IP only"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_ingress_cidr]
  }

  ingress {
    description = "HTTP (Caddy ACME challenge + redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow all outbound. -1 = every protocol. The box needs to reach Atlas,
  # pull Docker images, and fetch OS/Let's Encrypt updates.
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.project}-sg"
    Project = var.project
  }
}

# SSH key pair. AWS stores only the PUBLIC key and injects it into the instance's
# authorized_keys at launch. The private key is generated locally
# with ssh-keygen and never leaves the machine — it never enters Terraform state.
# file() reads the public key; pathexpand() resolves the leading ~ (Terraform
# does not expand it on its own).
resource "aws_key_pair" "deployer" {
  key_name   = "${var.project}-key"
  public_key = file(pathexpand(var.ssh_public_key_path))

  tags = {
    Name    = "${var.project}-key"
    Project = var.project
  }
}

# The application server. Launches into a default-VPC subnet (no subnet_id =
# AWS picks one), attaches the security group and key pair, and gets a roomier
# gp3 root disk than the AMI's 8 GB default (build-on-box needs the headroom).
# No user_data: the box comes up bare and is provisioned manually over SSH.
resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deployer.key_name
  vpc_security_group_ids = [aws_security_group.app.id]

  root_block_device {
    volume_size = var.root_volume_gb
    volume_type = "gp3"
  }

  tags = {
    Name    = "${var.project}-app"
    Project = var.project
  }
}

# Stable public IP. A plain instance's public IP changes on every stop/start;
# an Elastic IP is fixed, which is what DNS will point at. Note: AWS bills for
# the public IPv4 address (~$3.60/mo), attached or not.
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = {
    Name    = "${var.project}-eip"
    Project = var.project
  }
}
