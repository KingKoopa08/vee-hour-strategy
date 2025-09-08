# GitHub Setup with Personal Access Token

## Step 1: Create a Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a name like "vee-hour-deployment"
4. Select scopes:
   - ✅ repo (full control of private repositories)
   - ✅ workflow (if you plan to use GitHub Actions)
5. Click "Generate token"
6. **COPY THE TOKEN NOW** - you won't see it again!

## Step 2: Create Repository on GitHub

1. Go to https://github.com/new
2. Repository name: `vee-hour-strategy`
3. Make it Public or Private as needed
4. **DON'T** initialize with README, .gitignore, or license
5. Click "Create repository"

## Step 3: Push to GitHub with Token

Run these commands in your project directory:

```bash
# Add remote repository
git remote add origin https://github.com/KingKoopa08/vee-hour-strategy.git

# Set main as default branch
git branch -M main

# Push using token (you'll be prompted for credentials)
git push -u origin main
```

When prompted:
- Username: `KingKoopa08`
- Password: **PASTE YOUR PERSONAL ACCESS TOKEN** (not your GitHub password)

## Alternative: Store Credentials (Optional)

To avoid entering token every time:

```bash
# Store credentials in memory for 15 minutes
git config --global credential.helper cache

# Or store permanently (less secure)
git config --global credential.helper store
```

## Step 4: Clone URL for Deployment

When cloning on your Debian server, use:

```bash
# Using HTTPS with token
git clone https://<YOUR_TOKEN>@github.com/KingKoopa08/vee-hour-strategy.git

# Or clone normally and enter token when prompted
git clone https://github.com/KingKoopa08/vee-hour-strategy.git
```

## Security Notes

- **NEVER** commit your token to the repository
- Tokens should be treated like passwords
- Consider using SSH keys for better security
- Revoke tokens you're not using at https://github.com/settings/tokens

## Using SSH Instead (Recommended)

For better security, consider using SSH:

1. Generate SSH key: `ssh-keygen -t ed25519 -C "your_email@example.com"`
2. Add to GitHub: https://github.com/settings/keys
3. Use SSH URL: `git@github.com:KingKoopa08/vee-hour-strategy.git`