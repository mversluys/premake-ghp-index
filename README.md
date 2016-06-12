# Premake GitHub Package Index

Provides an index for Premake GitHub Packages.

Allows for publishing and discovery of packages.

Can be connected to either public GitHub or to a GitHub Enterprise installation.

## Local Installation and Setup

The following software is required to run the index

 * Node.js (include Node Package Manager)
 * Postgres SQL Database

Use node package manager to install dependencies

```bash
npm install
```

Use psql to setup the database

```bash
psql -c "create database premake_ghp;"
psql -d premake_ghp -f index.sql
```

A different database name (premake_ghp) can be used if you prefer, DATABASE_URL below needs to match.

On your GitHub account, register an application.

  https://github.com/settings/developers

You'll need the client id and secret from your application later.  

If deploying a private instance with GitHub Enterprise, the index needs to know where to find the API and OAUTH end points of your server.

```bash
GITHUB_API=https://your.github.name/api/v3
GITHUB_OAUTH=https://your.github.name/login/oauth
```

## Running in Heroku

  * Create an application in Heroku.
  * Add the Postgres database add-on.
  * Setup the database using `heroku pg:psql < database/index.sql`
  * Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET using the information from GitHub.
  * Set BASE_URL to the URL of the application.
  * Push this repository to it.

## Running locally using Docker

Setup the environment by create a .env file that contains

```bash
GITHUB_CLIENT_ID={application id for OAuth access GitHub}
GITHUB_CLIENT_SECRET={application secret for OAuth access to GitHub}
DATABASE_URL=postgres://postgres@database:5432/postgres
BASE_URL=http://{hostname}:5000
```

The {hostname} could be localhost or the address of the VM if using docker-machine. Use 

```bash
docker-machine env
```

to find the address of the VM.

Startup the database and the index using the following

```bash
docker-compose up
```

