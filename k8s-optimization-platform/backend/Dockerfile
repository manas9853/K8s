FROM python:3.11-slim

WORKDIR /app

# Install system dependencies + Trivy via official apt repo
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    postgresql-client \
    curl \
    gnupg \
    lsb-release \
    && curl -fsSL https://aquasecurity.github.io/trivy-repo/deb/public.key \
       | gpg --dearmor -o /usr/share/keyrings/trivy.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb generic main" \
       > /etc/apt/sources.list.d/trivy.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends trivy \
    && rm -rf /var/lib/apt/lists/*

# Pre-download Trivy vulnerability DB so the first scan is instant
RUN DOCKER_CONFIG=/tmp/trivy-dcfg mkdir -p /tmp/trivy-dcfg \
    && echo '{"auths":{}}' > /tmp/trivy-dcfg/config.json \
    && trivy image --no-progress --download-db-only 2>/dev/null || true

# Copy requirements first for better caching
COPY requirements.prod.txt .

# Install production Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.prod.txt

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p /app/logs

# Copy and make entrypoint executable
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]

# Run with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]

# Made with Bob
