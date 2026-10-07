/**
 * Interactive setup wizard entry (`runSetup`).
 */

import fs from 'node:fs'

import { EXIT_CODE } from '@/constants'

import { buildQualityGateYamlFromModel } from './setupModel'
import { promptSetupWizardModel } from './setupPrompts'
import { errorMessage } from '@/utils/errorMessage'

export { buildQualityGateYamlFromModel, type SetupWizardModel } from './setupModel'

export async function runSetup(): Promise<number> {
  try {
    const result = await promptSetupWizardModel()

    if (result === 'aborted') {
      console.log('Aborted.')

      return EXIT_CODE.ERROR
    }

    const yaml = buildQualityGateYamlFromModel(result)

    fs.writeFileSync(result.outputPath, yaml, 'utf8')
    console.log(`\nWrote ${result.outputPath}\n`)

    return EXIT_CODE.SUCCESS
  } catch (error) {
    const message = errorMessage(error)

    console.error(`Setup failed: ${message}`)

    return EXIT_CODE.ERROR
  }
}
