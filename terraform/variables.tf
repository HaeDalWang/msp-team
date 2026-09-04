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

variable "app_port" {
  description = "컨테이너 내부 애플리케이션 포트(80으로 매핑됨)"
  type        = number
  default     = 3000
}

variable "postgres_password" {
  description = "PostgreSQL msp 사용자 비밀번호"
  type        = string
  sensitive   = true
}

variable "session_secret" {
  description = "세션 서명용 랜덤 문자열. openssl rand -hex 32 로 생성."
  type        = string
  sensitive   = true
}

variable "slack_client_id" {
  description = "Slack App Client ID. 비워두면 Slack 로그인이 비활성화된다."
  type        = string
  default     = ""
}

variable "slack_client_secret" {
  description = "Slack App Client Secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "allowed_slack_team_id" {
  description = "허용할 Slack workspace team_id. 비워두면 team 제한 없음."
  type        = string
  default     = ""
}

variable "public_domain" {
  description = "EC2 퍼블릭 IP로 접속할 때는 비워둔다. 도메인을 붙이면 SLACK_REDIRECT_URI 계산에 사용된다."
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
