@echo off
echo Starting Trading Analysis Platform...
echo ================================

REM Stop any existing containers
echo Stopping existing containers...
docker-compose -f docker-compose.dev.yml down 2>nul

REM Start services
echo Starting Docker containers...
docker-compose -f docker-compose.dev.yml up -d

REM Wait for services to be ready
echo Waiting for services to be ready...
timeout /t 10 >nul

REM Check service health
echo Checking service status...
docker-compose -f docker-compose.dev.yml ps

echo.
echo Trading Analysis Platform is starting!
echo ================================
echo Frontend:   http://localhost:3010
echo Backend API: http://localhost:3001
echo WebSocket:   ws://localhost:3002
echo ================================
echo.
echo View logs: docker-compose -f docker-compose.dev.yml logs -f
echo Stop:      docker-compose -f docker-compose.dev.yml down
echo.
echo Note: Frontend may take 30-60 seconds to fully compile on first start
pause