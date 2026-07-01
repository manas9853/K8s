#!/usr/bin/env python3
"""
Token Manager CLI
Easy command-line tool to manage API tokens for cluster agents
"""
import requests
import sys
import json
import argparse
from typing import Optional
from datetime import datetime


class TokenManager:
    """CLI tool for managing API tokens"""
    
    def __init__(self, platform_url: str, admin_token: str):
        self.platform_url = platform_url.rstrip('/')
        self.admin_token = admin_token
        self.headers = {"Authorization": f"Bearer {admin_token}"}
    
    def generate_token(self, name: str, description: Optional[str] = None, 
                      expires_in_days: Optional[int] = 365):
        """Generate a new API token"""
        try:
            response = requests.post(
                f"{self.platform_url}/api/tokens/generate",
                json={
                    "name": name,
                    "description": description,
                    "expires_in_days": expires_in_days
                },
                headers=self.headers,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                print("\n✅ Token generated successfully!\n")
                print(f"Token Name: {data['name']}")
                print(f"Description: {data.get('description', 'N/A')}")
                print(f"Created: {data['created_at']}")
                print(f"Expires: {data.get('expires_at', 'Never')}")
                print(f"\n🔑 API Token (save this securely):")
                print(f"{data['token']}")
                print(f"\n📋 Token Hash (for reference):")
                print(f"{data['token_hash'][:16]}...")
                print("\n⚠️  IMPORTANT: Save this token now! You won't be able to see it again.")
                return data['token']
            else:
                print(f"❌ Error: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            print(f"❌ Error generating token: {e}")
            return None
    
    def list_tokens(self):
        """List all tokens"""
        try:
            response = requests.get(
                f"{self.platform_url}/api/tokens/list",
                headers=self.headers,
                timeout=30
            )
            
            if response.status_code == 200:
                tokens = response.json()
                
                if not tokens:
                    print("\n📝 No tokens found")
                    return
                
                print(f"\n📝 Total Tokens: {len(tokens)}\n")
                print(f"{'Name':<30} {'Status':<10} {'Created':<20} {'Usage':<10}")
                print("-" * 80)
                
                for token in tokens:
                    name = token['name'][:28]
                    status = token['status']
                    created = token['created_at'][:19]
                    usage = str(token['usage_count'])
                    
                    status_emoji = "✅" if status == "active" else "❌"
                    print(f"{name:<30} {status_emoji} {status:<8} {created:<20} {usage:<10}")
                
                print()
            else:
                print(f"❌ Error: {response.status_code} - {response.text}")
                
        except Exception as e:
            print(f"❌ Error listing tokens: {e}")
    
    def get_token_info(self, token_hash: str):
        """Get detailed information about a token"""
        try:
            response = requests.get(
                f"{self.platform_url}/api/tokens/{token_hash}",
                headers=self.headers,
                timeout=30
            )
            
            if response.status_code == 200:
                token = response.json()
                print("\n📋 Token Information:\n")
                print(f"Name: {token['name']}")
                print(f"Description: {token.get('description', 'N/A')}")
                print(f"Status: {token['status']}")
                print(f"Created: {token['created_at']}")
                print(f"Expires: {token.get('expires_at', 'Never')}")
                print(f"Last Used: {token.get('last_used', 'Never')}")
                print(f"Usage Count: {token['usage_count']}")
                print(f"Token Hash: {token['token_hash'][:16]}...")
                print()
            else:
                print(f"❌ Error: {response.status_code} - {response.text}")
                
        except Exception as e:
            print(f"❌ Error getting token info: {e}")
    
    def revoke_token(self, token_hash: str):
        """Revoke a token"""
        try:
            response = requests.delete(
                f"{self.platform_url}/api/tokens/{token_hash}",
                headers=self.headers,
                timeout=30
            )
            
            if response.status_code == 200:
                print(f"\n✅ Token {token_hash[:16]}... revoked successfully\n")
            else:
                print(f"❌ Error: {response.status_code} - {response.text}")
                
        except Exception as e:
            print(f"❌ Error revoking token: {e}")
    
    def verify_token(self, token: str):
        """Verify if a token is valid"""
        try:
            response = requests.post(
                f"{self.platform_url}/api/tokens/verify",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                print("\n✅ Token is valid!\n")
                print(f"Status: {data['status']}")
                print(f"Name: {data['name']}")
                print(f"Expires: {data.get('expires_at', 'Never')}")
                print()
            else:
                print(f"\n❌ Token is invalid or expired\n")
                print(f"Error: {response.status_code} - {response.text}\n")
                
        except Exception as e:
            print(f"❌ Error verifying token: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="Token Manager CLI for K8s Optimization Platform",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate a new token
  python token-manager.py generate --name "prod-cluster-1" --description "Production cluster in US-West"
  
  # List all tokens
  python token-manager.py list
  
  # Get token details
  python token-manager.py info <token-hash>
  
  # Revoke a token
  python token-manager.py revoke <token-hash>
  
  # Verify a token
  python token-manager.py verify <token>

Environment Variables:
  PLATFORM_URL    - Platform URL (default: http://localhost:8000)
  ADMIN_TOKEN     - Admin token for authentication (required)
        """
    )
    
    parser.add_argument(
        '--platform-url',
        default='http://localhost:8000',
        help='Platform URL (default: http://localhost:8000)'
    )
    
    parser.add_argument(
        '--admin-token',
        help='Admin token for authentication'
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Command to execute')
    
    # Generate command
    generate_parser = subparsers.add_parser('generate', help='Generate a new token')
    generate_parser.add_argument('--name', required=True, help='Token name')
    generate_parser.add_argument('--description', help='Token description')
    generate_parser.add_argument('--expires-in-days', type=int, default=365,
                                help='Token expiration in days (default: 365)')
    
    # List command
    subparsers.add_parser('list', help='List all tokens')
    
    # Info command
    info_parser = subparsers.add_parser('info', help='Get token information')
    info_parser.add_argument('token_hash', help='Token hash')
    
    # Revoke command
    revoke_parser = subparsers.add_parser('revoke', help='Revoke a token')
    revoke_parser.add_argument('token_hash', help='Token hash')
    
    # Verify command
    verify_parser = subparsers.add_parser('verify', help='Verify a token')
    verify_parser.add_argument('token', help='Token to verify')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    # Get admin token
    admin_token = args.admin_token or os.getenv('ADMIN_TOKEN')
    if not admin_token:
        print("❌ Error: Admin token required")
        print("Set ADMIN_TOKEN environment variable or use --admin-token flag")
        sys.exit(1)
    
    # Create token manager
    manager = TokenManager(args.platform_url, admin_token)
    
    # Execute command
    if args.command == 'generate':
        manager.generate_token(
            args.name,
            args.description,
            args.expires_in_days
        )
    elif args.command == 'list':
        manager.list_tokens()
    elif args.command == 'info':
        manager.get_token_info(args.token_hash)
    elif args.command == 'revoke':
        manager.revoke_token(args.token_hash)
    elif args.command == 'verify':
        manager.verify_token(args.token)


if __name__ == "__main__":
    import os
    main()

# Made with Bob
