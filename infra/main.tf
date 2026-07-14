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
# AWS picks one), attaches the security group, key pair, and instance role, then
# self-provisions on first boot via user_data (see user_data.sh.tftpl): installs
# Docker, reads MONGO_URI from SSM, and runs the app from its GHCR image.
resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deployer.key_name
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  # First-boot provisioning. templatefile() injects the values the script needs
  # at render time. user_data_replace_on_change makes Terraform REPLACE the
  # instance whenever the script changes — cloud-init runs user_data only on a
  # first boot, so a fresh instance is the only way to re-run it. The Elastic IP
  # is a separate resource and re-associates to the replacement, so the public
  # IP stays stable across replaces.
  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    region             = var.region
    ssm_parameter_name = var.mongo_uri_ssm_parameter_name
    compose_url        = var.compose_url
  })
  user_data_replace_on_change = true

  root_block_device {
    volume_size = var.root_volume_gb
    volume_type = "gp3"
  }

  # data.aws_ami.ubuntu is re-read every plan, so a newly published Noble AMI
  # would change `ami` — a ForceNew attribute — and replace the running box as a
  # side effect of ANY apply (e.g. a routine ssh_ingress_cidr update when the home
  # IP changes). Ignore drift on `ami` so upstream image churn never triggers an
  # unintended replacement. A deliberate `terraform apply -replace=aws_instance.app`
  # still picks up the current AMI, so this only suppresses the drive-by, not the
  # intentional refresh.
  lifecycle {
    ignore_changes = [ami]
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
