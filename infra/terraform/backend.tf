terraform {
  backend "s3" {
    bucket         = "stockrush-terraform-state"
    key            = "stockrush/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "stockrush-terraform-locks"
    encrypt        = true
  }
}
