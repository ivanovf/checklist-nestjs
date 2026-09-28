<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Local development

The API needs a MongoDB instance. A Compose file provisions one that matches the settings the
application already expects, so no database engine has to be installed on your machine.

```bash
cp env.example .env.local   # workable as-is; nothing needs filling in
pnpm install                # see Prerequisites below for Corepack
pnpm db:setup            # starts MongoDB, waits until healthy, seeds an admin account
pnpm start:dev           # the API, in a second terminal
```

Check it worked:

```bash
curl localhost:3000/api/health     # {"status":"ok","database":"up"}
```

Sign in with the seeded account — `dev.admin@localhost.test` / `localdevadmin`. These are
synthetic, published here on purpose, and must never be reused anywhere a deployment can
reach. The account exists because the API cannot bootstrap its own first administrator:
creating an account requires an administrator, and signing in requires an account that
already exists.

### Order matters

**Start the database before the API.** If the API starts first it does not fail — it retries
the connection indefinitely and never finishes starting, so no route answers at all, not even
`/api/health`. A silent, hanging process is the symptom; it is not a broken application. Run
`pnpm db:up`, then restart.

### Commands

| Command | Does |
|---|---|
| `pnpm db:setup` | `db:up` then `db:seed` — the one command to run after cloning |
| `pnpm db:up` | Starts MongoDB and waits until it is healthy |
| `pnpm db:down` | Stops it, keeping the data |
| `pnpm db:seed` | Creates the development admin. Safe to re-run |
| `pnpm db:reset` | Discards all local data. Follow with `pnpm db:setup` |

Data lives in a Docker-managed volume, not in the working tree, so nothing database-shaped can
be committed by accident.

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Prerequisites

- Node 24.x
- pnpm, through Corepack (it ships with Node). Run this once per machine:

```bash
$ corepack enable pnpm
```

`package.json` pins the exact pnpm version, and Corepack picks it up.

## Installation

```bash
$ pnpm install
```

## Moving an existing clone from npm

`npm install` now fails on purpose; this project installs with pnpm only.

```bash
$ rm -rf node_modules
$ corepack enable pnpm
$ pnpm install
```

## Adding dependencies

```bash
$ pnpm add <pkg>
```

If pnpm reports ignored build scripts, give the new package an explicit `true` or `false`
entry in `pnpm-workspace.yaml` under `allowBuilds`. CI fails until it has one.

## Running the app

```bash
# development
$ pnpm start

# watch mode
$ pnpm start:dev

# production mode
$ pnpm start:prod
```

## Test

```bash
# unit tests
$ pnpm test

# e2e tests
$ pnpm test:e2e

# test coverage
$ pnpm test:cov

# dependency audit
$ pnpm audit --audit-level high
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).
