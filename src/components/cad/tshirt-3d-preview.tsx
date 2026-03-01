'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { TshirtParams } from '@/lib/cad'

// Safe numeric coercion — handles undefined, '', and NaN
function n(val: unknown, fallback: number): number {
  const num = Number(val)
  return Number.isFinite(num) ? num : fallback
}

const S = 1 / 4       // mm → world units scale
const DROOP = 0.18    // sleeve droop angle (~10°) — natural sleeve hang

// ─── Body (single solid extrusion with realistic front-to-back depth) ────────
// Uses the front silhouette profile extruded to realistic depth (~22% of chest
// circumference), giving the shirt a proper 3D boxy presence when rotated.
// The mesh is centered in Z so the shirt sits at z=0 with equal front/back depth.
function BodiceMesh({
  params,
  color,
  bodyDepth,
}: {
  params: TshirtParams
  color: string
  bodyDepth: number
}) {
  const chest      = n(params.chest_finished_circumference_mm, 1040)
  const bodyLen    = n(params.body_length_hps_to_hem_mm, 700)
  const shoulder   = n(params.shoulder_width_mm, 460)
  const neckW      = n(params.neck_width_mm, 190)
  const neckDFront = n(params.neck_depth_front_mm, 80)
  const ds         = n(params.drop_shoulder_mm, 0)
  const hemSweep   = n(params.hem_sweep_width_mm, chest)

  const hw = (chest / 4) * S
  const hs = (shoulder / 2) * S
  const hn = (neckW / 2) * S
  const hh = (hemSweep / 4) * S
  const H  = bodyLen * S
  const nd = neckDFront * S
  const ah = (shoulder * 0.5 + ds) * S
  const isV = params.neckline_type === 'v'

  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-hh, 0)
    shape.lineTo(hh, 0)
    shape.lineTo(hw, H - ah)
    shape.lineTo(hs, H - nd)
    shape.lineTo(hn, H)
    if (isV) shape.lineTo(0, H - nd)
    shape.lineTo(-hn, H)
    shape.lineTo(-hs, H - nd)
    shape.lineTo(-hw, H - ah)
    shape.closePath()

    return new THREE.ExtrudeGeometry(shape, { depth: bodyDepth, bevelEnabled: false })
  }, [hw, hs, hn, hh, H, nd, ah, isV, bodyDepth])

  // ExtrudeGeometry extrudes in +Z from the shape face at z=0.
  // Positioning at z = -bodyDepth/2 centers the mesh: front face at +bodyDepth/2, back at -bodyDepth/2.
  return (
    <mesh geometry={geometry} position={[0, -H / 2, -bodyDepth / 2]}>
      <meshStandardMaterial color={color} roughness={0.8} metalness={0} />
    </mesh>
  )
}

// ─── Sleeve (CylinderGeometry truncated cone, oriented horizontally) ──────────
// Each sleeve is a tapered cylinder rotated 90° to point outward from the body
// with a ~10° natural downward droop.
//
// Scale: [1, 1, 0.6]
//   After rotation.z ≈ π/2, local X → world Y and local Z → world Z.
//   scale.x=1 keeps full world-Y diameter so the sleeve fills the armhole opening.
//   scale.z=0.6 compresses world-Z depth so the sleeve stays within the body thickness.
//
// Overlap: sleeve extends 15 world units INTO the body so there is no visible seam
//   at the junction — the body mesh occludes the inner portion and the sleeve
//   appears to grow organically from the body side.
function SleeveMesh({
  params,
  side,
  color,
}: {
  params: TshirtParams
  side: 'left' | 'right'
  color: string
}) {
  const chest      = n(params.chest_finished_circumference_mm, 1040)
  const shoulder   = n(params.shoulder_width_mm, 460)
  const bodyLen    = n(params.body_length_hps_to_hem_mm, 700)
  const bicep      = n(params.bicep_width_mm, 360)
  const opening    = n(params.sleeve_opening_width_mm, 320)
  const sleevLen   = n(params.sleeve_length_mm, 220)
  const ds         = n(params.drop_shoulder_mm, 0)
  const neckDFront = n(params.neck_depth_front_mm, 80)

  const hw     = (chest / 4) * S
  const H      = bodyLen * S
  const ah     = (shoulder * 0.5 + ds) * S
  const nd     = neckDFront * S
  const bicepR = (bicep / 4) * S
  const cuffR  = (opening / 4) * S
  const lenS   = sleevLen * S

  const geometry = useMemo(
    () => new THREE.CylinderGeometry(bicepR, cuffR, lenS, 16),
    [bicepR, cuffR, lenS]
  )

  // rotation.z = π/2 - DROOP makes the right sleeve axis point rightward and
  // slightly down (natural droop). Left sleeve mirrors with negative angle.
  const rotZ = side === 'right' ? Math.PI / 2 - DROOP : -(Math.PI / 2 - DROOP)

  // Extend 25 units into the body so the sleeve merges seamlessly at the junction.
  // The body mesh occludes the inner portion; only the exterior is visible.
  const OVERLAP = 25
  const xPos = side === 'right' ? hw + lenS / 2 - OVERLAP : -(hw + lenS / 2 - OVERLAP)

  // Center the sleeve at the true armhole midpoint (between armhole bottom and shoulder point).
  // Subtract droop offset so the bicep end aligns with the armhole midpoint after rotation.
  const yCentre = H / 2 - (ah + nd) / 2 - lenS * (Math.sin(DROOP) / 2)

  return (
    <mesh
      geometry={geometry}
      position={[xPos, yCentre, 0]}
      rotation={[0, 0, rotZ]}
      scale={[1, 1, 0.6]}
    >
      <meshStandardMaterial color={color} roughness={0.8} metalness={0} />
    </mesh>
  )
}

// ─── Neckband (elliptical torus) ─────────────────────────────────────────────
// Positioned on the front face of the body (+bodyDepth/2 + small offset).
function NeckbandMesh({
  params,
  color,
  bodyDepth,
}: {
  params: TshirtParams
  color: string
  bodyDepth: number
}) {
  const neckW  = n(params.neck_width_mm, 190)
  const neckDF = n(params.neck_depth_front_mm, 80)
  const nbW    = n(params.neckband_finished_width_mm, 20)
  const bodyLen = n(params.body_length_hps_to_hem_mm, 700)

  const H    = bodyLen * S
  const nd   = neckDF * S
  const rx   = (neckW / 2) * S
  const ry   = nd * 0.5
  const tube = Math.max(0.5, nbW * S * 0.8)
  const avgR = (rx + ry) / 2

  if (rx <= 0 || ry <= 0 || avgR <= 0) return null

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const geometry = useMemo(
    () => new THREE.TorusGeometry(avgR, tube, 8, 48),
    [avgR, tube]
  )

  // Neckband center in world Y: H/2 – nd/2 (middle of neck opening)
  const yPos = H / 2 - nd / 2

  // Z: front face of body is at +bodyDepth/2; position neckband just in front
  const zPos = bodyDepth / 2 + 2

  return (
    <mesh
      geometry={geometry}
      position={[0, yPos, zPos]}
      scale={[rx / avgR, ry / avgR, 1]}
    >
      <meshStandardMaterial color={color} roughness={0.5} metalness={0} />
    </mesh>
  )
}

// ─── Pocket plane ─────────────────────────────────────────────────────────────
// Flat rectangle positioned on the front face of the body.
function PocketMesh({
  params,
  color,
  bodyDepth,
}: {
  params: TshirtParams
  color: string
  bodyDepth: number
}) {
  if (!params.pocket_enabled || !params.pocket_width_mm || !params.pocket_height_mm) return null

  const bodyLen = n(params.body_length_hps_to_hem_mm, 700)
  const H   = bodyLen * S
  const pw  = n(params.pocket_width_mm, 100) * S
  const ph  = n(params.pocket_height_mm, 120) * S
  const pcf = n(params.pocket_placement_from_cf_mm, 70) * S
  const psh = n(params.pocket_placement_from_shoulder_mm, 130) * S

  const px = pcf
  const py = H / 2 - psh

  // Z: sit on the front face of the body
  const zPos = bodyDepth / 2 + 2

  return (
    <mesh position={[px, py, zPos]}>
      <planeGeometry args={[pw, ph]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────
function TshirtScene({ params }: { params: TshirtParams }) {
  const groupRef = useRef<THREE.Group>(null)

  // Body depth ≈ 12% of chest circumference — visible 3D presence without looking like a brick.
  // For M (chest=1040mm): 1040 * 0.12 * 0.25 ≈ 31 world units.
  const chest     = n(params.chest_finished_circumference_mm, 1040)
  const bodyDepth = Math.max(12, Math.round(chest * 0.12 * S))

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.1
  })

  const bodyColor   = params.body_color_hex     || '#F5F0E8'
  const neckColor   = params.neckband_color_hex || '#1A1A1A'
  const pocketColor = params.pocket_color_hex   || bodyColor

  return (
    <group ref={groupRef}>
      <BodiceMesh params={params} color={bodyColor} bodyDepth={bodyDepth} />
      <SleeveMesh params={params} side="left"  color={bodyColor} />
      <SleeveMesh params={params} side="right" color={bodyColor} />
      <NeckbandMesh params={params} color={neckColor} bodyDepth={bodyDepth} />
      {params.pocket_enabled && (
        <PocketMesh params={params} color={pocketColor} bodyDepth={bodyDepth} />
      )}
    </group>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export interface TshirtPreview3DProps {
  params: TshirtParams
  hasGenerated: boolean
}

export default function TshirtPreview3D({ params, hasGenerated }: TshirtPreview3DProps) {
  if (!hasGenerated) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] bg-neutral-950 rounded-lg">
        <p className="text-neutral-500 text-sm">Generate a pattern to see 3D preview</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-[400px]" style={{ background: '#0f172a' }}>
      <Canvas
        camera={{ position: [0, 0, 300], fov: 45 }}
        style={{ background: '#0f172a' }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[100, 150, 150]} intensity={1.2} />
        <directionalLight position={[-80, -60, -100]} intensity={0.3} />
        <TshirtScene params={params} />
        <OrbitControls enableDamping dampingFactor={0.05} makeDefault />
      </Canvas>
      <div className="absolute bottom-2 right-3 text-neutral-600 text-[10px] pointer-events-none">
        Drag to rotate · Scroll to zoom
      </div>
    </div>
  )
}
