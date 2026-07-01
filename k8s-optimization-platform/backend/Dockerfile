FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Trivy via direct binary download (much faster than apt repo)
RUN TRIVY_VERSION=$(curl -s https://api.github.com/repos/aquasecurity/trivy/releases/latest \
      | grep '"tag_name"' | cut -d'"' -f4 | sed 's/v//') \
    && curl -sfL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
       | tar -xz -C /usr/local/bin trivy

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
