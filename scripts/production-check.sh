# Production Checklist Script
# Run before deploying to production

echo "=== Appointment Booking Platform - Production Readiness Check ==="
echo ""

# Check environment variables
echo "1. Checking required environment variables..."
required_vars=("DATABASE_URL" "REDIS_HOST" "JWT_PRIVATE_KEY" "JWT_PUBLIC_KEY" "RAZORPAY_KEY_ID" "RAZORPAY_KEY_SECRET" "RAZORPAY_WEBHOOK_SECRET")
for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "   ❌ $var is not set"
  else
    echo "   ✅ $var is set"
  fi
done
echo ""

# Check Node version
echo "2. Checking Node.js version..."
node_version=$(node -v)
echo "   Node version: $node_version"
echo ""

# Check if migrations are applied
echo "3. Remember to run migrations..."
echo "   Run: npx prisma migrate deploy"
echo ""

# Check Docker build
echo "4. Test Docker build..."
echo "   Run: docker build -f docker/Dockerfile.api -t appointment-booking-api:test ."
echo ""

# Security checks
echo "5. Security checklist..."
echo "   - [ ] All secrets in secret manager (not .env in repo)"
echo "   - [ ] HTTPS configured"
echo "   - [ ] CORS restricted to specific origins"
echo "   - [ ] Rate limiting enabled"
echo "   - [ ] Database SSL enabled"
echo "   - [ ] JWT keys rotated"
echo "   - [ ] Webhook secrets configured"
echo ""

echo "=== Checklist complete ==="
