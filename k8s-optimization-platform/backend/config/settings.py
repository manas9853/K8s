"""
Application Settings and Configuration
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings"""
    
    # Application
    APP_NAME: str = "Kubernetes Optimization Platform"
    API_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # CORS - will be split from comma-separated string
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8000,http://127.0.0.1:3000,http://127.0.0.1:8000"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Convert CORS_ORIGINS string to list"""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/k8s_optimization"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_CACHE_TTL: int = 3600  # 1 hour
    
    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    
    # Kubernetes
    K8S_IN_CLUSTER: bool = False
    K8S_CONFIG_PATH: str = "~/.kube/config"
    K8S_CONTEXT: str = ""
    
    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4-turbo-preview"
    OPENAI_MAX_TOKENS: int = 4000
    
    # Cost Calculation
    CPU_COST_PER_CORE_HOUR: float = 0.031  # AWS pricing
    MEMORY_COST_PER_GB_HOUR: float = 0.0035  # AWS pricing
    STORAGE_COST_PER_GB_MONTH: float = 0.10  # AWS EBS pricing
    
    # Carbon Footprint
    CARBON_PER_KWH: float = 0.35  # kg CO2 per kWh
    CPU_WATTS_PER_CORE: float = 10.0
    MEMORY_WATTS_PER_GB: float = 0.375
    
    # Optimization
    CPU_BUFFER_PERCENTAGE: float = 20.0  # Add 20% buffer to recommendations
    MEMORY_BUFFER_PERCENTAGE: float = 20.0
    MIN_RECOMMENDATION_CONFIDENCE: float = 0.7
    LOOKBACK_DAYS: int = 7
    
    # Auto-fix
    AUTO_FIX_ENABLED: bool = False
    AUTO_FIX_DRY_RUN: bool = True
    AUTO_FIX_MAX_BATCH_SIZE: int = 10
    
    # Cleanup
    CLEANUP_UNUSED_DAYS: int = 90
    CLEANUP_SAFE_DELETE_ENABLED: bool = True
    
    # Monitoring
    PROMETHEUS_URL: str = "http://localhost:9090"
    METRICS_COLLECTION_INTERVAL: int = 300  # 5 minutes
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    
    # Security
    SECRET_KEY: str = "change-this-in-production"
    JWT_SECRET_KEY: str = "change-this-jwt-secret-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 60
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# Create settings instance
settings = Settings()

# Made with Bob
