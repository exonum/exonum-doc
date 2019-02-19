const { Git } = require('git-interface')
const { exec } = require('shelljs')
const YAML = require('yamljs')
const fs = require('fs')
const rimraf = require('rimraf')
const path = require('path')

const BUILD_COMMAND = 'mkdocs build'

const BUILD_ENVIRONMENT = process.env.BUILD_ENVIRONMENT

const mkdocsBuild = (path, configFile) => asyncExec(`${BUILD_COMMAND} -d ${path} -f ${configFile}`)

const asyncExec = command => new Promise((resolve, reject) =>
  exec(command, (code, stdout, stderr) => code === 0 ? resolve(stdout) : reject(stderr)))

const cleanUp = () => new Promise((resolve, reject) =>
  rimraf('./version', (err) => err ? reject(err) : resolve()))

const to = promise => promise.then(data => [data, null]).catch(err => [null, { err }])

const generateVersionedDocs = async (versions) => {
  await cleanUp()

  const git = new Git({})
  
  if (BUILD_ENVIRONMENT != 'jenkins') {
    const returnToBranch = await git.getBranchName()
  }

  fs.mkdirSync('./version')
  let failed = 0
  const extraVersions = [...versions]
  extraVersions[0] = 'latest'
  for (let version of versions) {
    const [, error] = await to(git.checkout(version))
    if (error) {
      console.error(`Checkout failed. Tag ${version} is not built.`)
      failed++
      continue
    }
    version = versions.indexOf(version) === 0 ? 'latest' : version
    const versionedMkdocs = YAML.load('mkdocs.yml')
    const configFile = `./version/${version}.yml`
    versionedMkdocs.extra.versions = extraVersions
    fs.writeFileSync(`./version/${version}.yml`, YAML.stringify(versionedMkdocs, 7), 'utf8')
    await mkdocsBuild(`./version/${version}`, configFile)
    if (BUILD_ENVIRONMENT != 'jenkins') {
      await git.checkout(returnToBranch)
    }
  }

  return { failed, success: versions.length - failed }
}

const versionsList = fs.readFileSync('./versions.txt', 'utf-8')
  .split(/\r\n|\r|\n/)
  .filter(item => item !== '')

generateVersionedDocs(versionsList)
  .then(data => console.info(`Documentation built: ${data.success} versions success, ${data.failed} failed.`))
  .catch(e => console.error('[ERROR]', e))
