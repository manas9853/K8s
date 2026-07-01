FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy agent code
COPY agent.py .

# Make agent executable
RUN chmod +x agent.py

# Run as non-root user
RUN useradd -m -u 1000 agent && chown -R agent:agent /app
USER agent

# Run the agent
CMD ["python", "-u", "agent.py"]

# Made with Bob
