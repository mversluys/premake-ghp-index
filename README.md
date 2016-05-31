# Premake GitHub Package Index

Provides an index for Premake GitHub Packages.

Allows for publishing and discovery of packages.

Can be connected to either public GitHub or to a GitHub Enterprise installation.

## Installation and Setup

The following software is required to run the index

 * Node.js (include Node Package Manager)
 * Postgres SQL Database

Use node package manager to install dependencies

  npm install


Setup a GitHub application access

Install the database schema


Set the following environment variables

  GITHUB_CLIENT_ID={application id for OAuth access GitHub}
  GITHUB_CLIENT_SECRET={application secret for OAuth access to GitHub}
  GITHUB_API={url of the GitHub API, defaults to https://api.github.com, change if using GitHub enterprise}
  DATABASE_URL={url to connect to the database}

## Running locally using node

  node index.js
