# Premake GitHub Package Index

Provides an index for Premake GitHub Packages.

Allows for publishing and discovery of packages.

Can be connected to either public GitHub or to a GitHub Enterprise installation.

## Local Installation and Setup

The following software is required to run the index

 * Node.js (include Node Package Manager)
 * Postgres SQL Database

Use node package manager to install dependencies

  npm install

Use psql to setup the database

  > psql -c "create database premake_ghp;"
  > psql -d premake_ghp -f index.sql

A different database name (premake_ghp) can be used if you prefer, DATABASE_URL below needs to match.

On your GitHub account, register an application.

  https://github.com/settings/developers

Setup environment variables

  GITHUB_CLIENT_ID={application id for OAuth access GitHub}
  GITHUB_CLIENT_SECRET={application secret for OAuth access to GitHub}
  DATABASE_URL=postgres:///premake_ghp
  BASE_URL=http://localhost:5000

It's recomended to place them into .env then import them before running node

  export $(cat .env | xargs)

Running locally using node

  node index.js

## Running in Heroku

  * Create an application in Heroku.
  * Add the Postgres database add-on.
  * Setup the database using `heroku pg:psql < index.sql`
  * Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET using the information from GitHub.
  * Set BASE_URL to the URL of the application.
  * Push this repository to it.
