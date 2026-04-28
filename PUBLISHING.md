# Publishing AniBuddy to JetBrains Marketplace

## 1. Set up JetBrains Marketplace Account

1. Go to [plugins.jetbrains.com](https://plugins.jetbrains.com)
2. Sign in or create account
3. Go to **My Profile** → **Edit** → **Manage Vendors**
4. Create a new vendor or select existing (name: "justjammin" for this plugin)
5. Verify vendor ownership via email confirmation
6. Generate Marketplace API token at **My Profile** → **API tokens**
   - Copy token and store securely (needed for CI/CD or local publishing)

## 2. Configure Plugin Signing

Plugin signing verifies authenticity and enables auto-updates. You need a certificate chain and private key.

### Generate Signing Certificate (One-Time)

Run in project root:

```bash
./gradlew generateSigningCertificate \
  --certificate-password YOUR_PASSWORD \
  --private-key-password YOUR_PASSWORD
```

This creates `cert.pem` and `privateKey.pem`. Store both securely (git ignore them, use CI secrets).

### Add Signing Credentials to build.gradle.kts

Update the `signing {}` block:

```kotlin
signing {
    certificateChain = providers.environmentVariable("CERTIFICATE_CHAIN")
    privateKey = providers.environmentVariable("PRIVATE_KEY")
    password = providers.environmentVariable("PRIVATE_KEY_PASSWORD")
}
```

Set environment variables before building:

```bash
export CERTIFICATE_CHAIN=$(cat cert.pem)
export PRIVATE_KEY=$(cat privateKey.pem)
export PRIVATE_KEY_PASSWORD=YOUR_PASSWORD
```

Or store in CI/CD secrets (GitHub Actions, GitLab CI, etc.) and reference them in your workflow.

## 3. Configure Publishing Block

Your `build.gradle.kts` already has the publishing block correctly set:

```kotlin
publishing {
    token = providers.environmentVariable("JETBRAINS_MARKETPLACE_TOKEN")
}
```

Set the environment variable:

```bash
export JETBRAINS_MARKETPLACE_TOKEN=your_api_token_from_step_1
```

## 4. Verify Plugin Metadata

Check `src/main/resources/META-INF/plugin.xml`:

- **name**: "AniBuddy Agent Monitor" ✓
- **id**: "com.justjammin.anibuddy" ✓
- **vendor**: "justjammin" ✓
- **description**: Present and clear ✓
- **change-notes** (if updating): Add `<change-notes>...</change-notes>` tag for version changelog
- **version** in plugin.xml: Should match `build.gradle.kts` version (currently "0.1.0")

## 5. Add Plugin Icon

JetBrains Marketplace requires a **300×300 PNG icon**.

1. Save icon as `src/main/resources/META-INF/pluginIcon.png` (300×300)
2. Optionally add dark variant: `src/main/resources/META-INF/pluginIcon_dark.png`
3. Icon displays on Marketplace and in IDE plugin list

## 6. Build and Sign the Plugin

```bash
./gradlew buildPlugin
```

Output zip at `build/distributions/Anibuddy-0.1.0.zip` is ready to publish (already signed if credentials set).

## 7. Publish to Marketplace

```bash
./gradlew publishPlugin
```

This:
- Signs the plugin with your certificate
- Uploads JAR to JetBrains Marketplace
- Requires `JETBRAINS_MARKETPLACE_TOKEN` env var

**Success output** shows upload ID and Marketplace URL.

## 8. Review Process

JetBrains reviews all submissions. Typical timeline: **1–3 days**.

**Review checks:**
- Plugin functionality and stability
- No malware, security issues, or privacy violations
- No excessive resource usage
- Code quality and best practices
- Icon, description, and metadata clarity
- IDE compatibility (sinceBuild/untilBuild correct)

**Your plugin metadata:**
- sinceBuild: "243" (2024.3) ✓
- untilBuild: null (no upper bound, auto-updated) ✓

## 9. Common Rejection Reasons

- **Icon missing or wrong size** — must be 300×300 PNG
- **Description too vague** — be specific about what plugin does
- **No change notes on update** — always document what changed
- **Bundled JARs missing sources** — include source code or properly attribute dependencies
- **Too many plugin actions** — keep plugin menu clean and focused
- **Incompatible IDE versions** — test on declared sinceBuild version
- **Broken extension points** — ensure all declared extensions have proper implementations

## 10. After Publication

- **Check status** at [plugins.jetbrains.com](https://plugins.jetbrains.com) → search "AniBuddy Agent Monitor"
- **Monitor reviews** and user feedback
- **Update regularly** — patch bugs, add features, keep deps up-to-date
- **Use version numbers** semver (0.1.0 → 0.1.1 patch, 0.2.0 minor, etc.)

## CI/CD Integration (Optional)

Add to GitHub Actions `.github/workflows/publish.yml`:

```yaml
name: Publish Plugin

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to publish'
        required: true

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      - run: ./gradlew publishPlugin
        env:
          CERTIFICATE_CHAIN: ${{ secrets.CERTIFICATE_CHAIN }}
          PRIVATE_KEY: ${{ secrets.PRIVATE_KEY }}
          PRIVATE_KEY_PASSWORD: ${{ secrets.PRIVATE_KEY_PASSWORD }}
          JETBRAINS_MARKETPLACE_TOKEN: ${{ secrets.JETBRAINS_MARKETPLACE_TOKEN }}
```

Store `CERTIFICATE_CHAIN`, `PRIVATE_KEY`, `PRIVATE_KEY_PASSWORD`, and `JETBRAINS_MARKETPLACE_TOKEN` in GitHub Secrets.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Invalid token" | Verify token at plugins.jetbrains.com, check expiry |
| "Plugin already exists" | Increment version in build.gradle.kts and plugin.xml |
| "Certificate expired" | Regenerate signing certificate (step 2) |
| "Icon missing" | Add 300×300 PNG to `src/main/resources/META-INF/pluginIcon.png` |
| "Change notes required" | Add `<change-notes>...</change-notes>` to plugin.xml on updates |
| Build fails | Run `./gradlew clean` then try again; check Java 17+ installed |
