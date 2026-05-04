const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const walk = (dir) => {
  let results = []
  const list = fs.readdirSync(dir)
  list.forEach((file) => {
    file = path.join(dir, file)
    const stat = fs.statSync(file)
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file))
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file)
      }
    }
  })
  return results
}

const files = [...walk('./src/lib'), ...walk('./src/app/api')]

files.forEach((file) => {
  if (file.includes('platform-config.ts')) return // Skip the config file itself

  let content = fs.readFileSync(file, 'utf8')
  let changed = false

  const googleRegex = /(?<!\?\?\s*)process\.env\.GOOGLE_AI_KEY/g
  const openaiRegex = /(?<!\?\?\s*)process\.env\.OPENAI_API_KEY/g
  const anthropicRegex = /(?<!\?\?\s*)process\.env\.ANTHROPIC_API_KEY/g

  if (googleRegex.test(content) || openaiRegex.test(content) || anthropicRegex.test(content)) {
    if (!content.includes('getPlatformConfig')) {
      content = `import { getPlatformConfig } from '@/lib/platform-config'\n` + content
    }

    content = content.replace(googleRegex, '((await getPlatformConfig()).geminiApiKey ?? process.env.GOOGLE_AI_KEY)')
    content = content.replace(openaiRegex, '((await getPlatformConfig()).openaiApiKey ?? process.env.OPENAI_API_KEY)')
    content = content.replace(anthropicRegex, '((await getPlatformConfig()).anthropicApiKey ?? process.env.ANTHROPIC_API_KEY)')

    changed = true
  }

  // Also fix double nesting if my previous script or this one created things like:
  // ((await getPlatformConfig()).geminiApiKey ?? ((await getPlatformConfig()).geminiApiKey ?? process.env.GOOGLE_AI_KEY))
  const fixDoubleGoogle = /\(\(await getPlatformConfig\(\)\)\.geminiApiKey \?\? \(\(await getPlatformConfig\(\)\)\.geminiApiKey \?\? process\.env\.GOOGLE_AI_KEY\)\)/g
  if (fixDoubleGoogle.test(content)) {
    content = content.replace(fixDoubleGoogle, '((await getPlatformConfig()).geminiApiKey ?? process.env.GOOGLE_AI_KEY)')
    changed = true
  }

  const fixDoubleOpenAI = /\(\(await getPlatformConfig\(\)\)\.openaiApiKey \?\? \(\(await getPlatformConfig\(\)\)\.openaiApiKey \?\? process\.env\.OPENAI_API_KEY\)\)/g
  if (fixDoubleOpenAI.test(content)) {
    content = content.replace(fixDoubleOpenAI, '((await getPlatformConfig()).openaiApiKey ?? process.env.OPENAI_API_KEY)')
    changed = true
  }

  const fixDoubleAnthropic = /\(\(await getPlatformConfig\(\)\)\.anthropicApiKey \?\? \(\(await getPlatformConfig\(\)\)\.anthropicApiKey \?\? process\.env\.ANTHROPIC_API_KEY\)\)/g
  if (fixDoubleAnthropic.test(content)) {
    content = content.replace(fixDoubleAnthropic, '((await getPlatformConfig()).anthropicApiKey ?? process.env.ANTHROPIC_API_KEY)')
    changed = true
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8')
    console.log(`Updated ${file}`)
  }
})

console.log('Done replacing API keys.')
