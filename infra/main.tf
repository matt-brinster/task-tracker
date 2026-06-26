# A fresh AWS account ships with a default VPC in every region. A data source
# READS something that already exists (vs. a resource, which CREATES). We look
# up the default VPC so the security group has a network to attach to — without
# us provisioning VPC infrastructure yet.
data "aws_vpc" "default" {
  default = true
}

# Increment 1's only real resource. A security group is a stateful virtual
# firewall: ingress = what's allowed IN, egress = what's allowed OUT. Return
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
