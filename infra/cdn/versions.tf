terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    netlify = {
      source  = "netlify/netlify"
      version = "~> 0.4"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
  default_tags {
    tags = {
      Project   = "listening-room"
      Component = "asset-cdn"
      ManagedBy = "terraform"
    }
  }
}

provider "netlify" {
  token = var.netlify_api_token
}

data "aws_caller_identity" "current" {}
