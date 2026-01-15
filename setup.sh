#!/bin/bash

# Setup script for College Office System Backend

echo "Installing backend dependencies..."
npm install

if [ ! -f .env ]; then
    echo "Creating .env file from example..."
    cp .env.example .env
    echo "Please update .env with your database credentials."
fi

echo "Setup complete!"
echo "To initialize the database with an admin user, run: node seed.js"
echo "To start the server, run: npm run dev"
