variable "aws_region" {
  description = "배포할 AWS 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "리소스 이름에 붙는 접두어. 다른 계정/환경에 복제할 때 이 값만 바꾸면 리소스 이름이 충돌하지 않는다."
  type        = string
  default     = "msp-weekly-review"
}

variable "instance_type" {
  description = "EC2 인스턴스 타입"
  type        = string
  default     = "t3.medium"
}

variable "ssh_key_name" {
  description = "EC2에 SSH 접속할 때 쓸 기존 AWS 키페어 이름. 비워두면 SSH 접속 없이 SSM만 사용."
  type        = string
  default     = ""
}

variable "backup_retention_days" {
  description = "S3 백업 버킷의 객체 보존 기간(일)"
  type        = number
  default     = 30
}

variable "repo_url" {
  description = "EC2가 부팅 시 git clone할 이 리포지토리의 URL (예: https://github.com/org/msp-weekly-review.git). 비공개 저장소면 배포 토큰을 포함한 URL을 쓰거나 SSH 배포키를 별도로 구성해야 한다."
  type        = string
}

variable "repo_ref" {
  description = "clone할 브랜치/태그"
  type        = string
  default     = "main"
}

# 아래 값들은 Terraform이 직접 쓰지 않는다. terraform apply 완료 후 출력되는
# app_public_ip를 확인한 다음, scripts/deploy-app.sh를 EC2에서 실행할 때 환경변수로
# 넘긴다 (SLACK_REDIRECT_URI가 실제 IP/도메인을 알아야 하기 때문에 2단계로 분리함).
# 이 변수 선언은 terraform.tfvars에 값이 있어도 에러 없이 무시되도록 남겨둔 것이 아니라,
# deploy-app.sh 사용법을 한 곳에 문서화하기 위한 참고용 주석이다.
