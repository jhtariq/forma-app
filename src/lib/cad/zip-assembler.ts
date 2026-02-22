import JSZip from 'jszip'

interface ManufacturingPackArtifacts {
  dxf: string
  svg: string
  techSketchSvg: string
  specSheet: object
  constructionNotes: object
  bom: object
  parameterSnapshot: object
  versionDiff?: object | null
}

export async function assembleManufacturingPack(
  artifacts: ManufacturingPackArtifacts
): Promise<Buffer> {
  const zip = new JSZip()
  const folder = zip.folder('manufacturing_pack')!

  folder.file('pattern_production.dxf', artifacts.dxf)
  folder.file('pattern_preview.svg', artifacts.svg)
  folder.file('tech_sketch.svg', artifacts.techSketchSvg)
  folder.file('spec_sheet.json', JSON.stringify(artifacts.specSheet, null, 2))
  folder.file('construction_notes.json', JSON.stringify(artifacts.constructionNotes, null, 2))
  folder.file('bom.json', JSON.stringify(artifacts.bom, null, 2))
  folder.file('parameter_snapshot.json', JSON.stringify(artifacts.parameterSnapshot, null, 2))

  if (artifacts.versionDiff) {
    folder.file('version_diff.json', JSON.stringify(artifacts.versionDiff, null, 2))
  }

  const uint8Array = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return Buffer.from(uint8Array)
}
