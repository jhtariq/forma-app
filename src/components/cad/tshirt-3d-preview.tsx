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

const S = 1 / 4   // mm → world units scale
const DEPTH = 2   // fabric extrude depth (world units)

// ─── Full symmetric front/back bodice ────────────────────────────────────────
// Draws the COMPLETE panel (both left and right halves, symmetric about x=0).
// Y=0 at hem, Y=H at shoulder/neck line. Mesh is centered vertically at origin.
function BodiceMesh({
  params,
  isBack,
  color,
}: {
  params: TshirtParams
  isBack: boolean
  color: string
}) {
  const chest    = n(params.chest_finished_circumference_mm, 1040)
  const bodyLen  = n(params.body_length_hps_to_hem_mm, 700)
  const shoulder = n(params.shoulder_width_mm, 460)
  const neckW    = n(params.neck_width_mm, 190)
  const neckDFront = n(params.neck_depth_front_mm, 80)
  const neckDBack  = n(params.neck_depth_back_mm, 25)
  const ds         = n(params.drop_shoulder_mm, 0)
  const hemSweep   = n(params.hem_sweep_width_mm, chest)

  // Half-widths in world units
  const hw = (chest / 4) * S      // side seam x (= chest/2 total panel width)
  const hs = (shoulder / 2) * S   // shoulder x
  const hn = (neckW / 2) * S      // neck opening x
  const hh = (hemSweep / 4) * S   // hem x
  const H  = bodyLen * S
  const nd = (isBack ? neckDBack : neckDFront) * S   // neck depth from top
  const ah = (shoulder * 0.5 + ds) * S               // armhole depth from top
  const isV = !isBack && params.neckline_type === 'v'

  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    // Bottom hem → right side → right neck → [V-neck] → left neck → left side → close
    shape.moveTo(-hh, 0)
    shape.lineTo(hh, 0)
    shape.lineTo(hw, H - ah)        // right side seam at armhole level
    shape.lineTo(hs, H - nd)        // right shoulder point
    shape.lineTo(hn, H)             // right neck corner
    if (isV) shape.lineTo(0, H - nd) // V-neck centre dip
    shape.lineTo(-hn, H)            // left neck corner
    shape.lineTo(-hs, H - nd)       // left shoulder point
    shape.lineTo(-hw, H - ah)       // left side seam at armhole level
    shape.closePath()

    return new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false })
  }, [hw, hs, hn, hh, H, nd, ah, isV])

  // Back panel sits just behind the front
  const zPos = isBack ? -(DEPTH + 0.5) : 0

  return (
    <mesh geometry={geometry} position={[0, -H / 2, zPos]}>
      <meshStandardMaterial color={color} roughness={0.8} metalness={0} />
    </mesh>
  )
}

// ─── Sleeve mesh ──────────────────────────────────────────────────────────────
// Trapezoidal sleeve extending HORIZONTALLY from each side of the bodice.
// The cap edge (bicep-width) aligns with the bodice side seam.
function SleeveMesh({
  params,
  side,
  color,
}: {
  params: TshirtParams
  side: 'left' | 'right'
  color: string
}) {
  const chest    = n(params.chest_finished_circumference_mm, 1040)
  const shoulder = n(params.shoulder_width_mm, 460)
  const bodyLen  = n(params.body_length_hps_to_hem_mm, 700)
  const bicep    = n(params.bicep_width_mm, 360)
  const opening  = n(params.sleeve_opening_width_mm, 320)
  const sleevLen = n(params.sleeve_length_mm, 220)
  const ds       = n(params.drop_shoulder_mm, 0)

  const hw     = (chest / 4) * S
  const H      = bodyLen * S
  const ah     = (shoulder * 0.5 + ds) * S
  const bicepS = bicep * S
  const openS  = opening * S
  const lenS   = sleevLen * S

  // Vertically centre the sleeve on the armhole area of the bodice
  // (armhole spans world-Y from H/2–ah to H/2; midpoint = H/2 – ah/2)
  const yCentre = H / 2 - ah / 2

  const geometry = useMemo(() => {
    const shape = new THREE.Shape()

    if (side === 'right') {
      // CCW winding — front face toward +Z
      shape.moveTo(0, -bicepS / 2)       // cap bottom (at bodice edge)
      shape.lineTo(lenS, -openS / 2)     // cuff bottom
      shape.lineTo(lenS, openS / 2)      // cuff top
      shape.lineTo(0, bicepS / 2)        // cap top
    } else {
      // Mirror: extends in –X. Reverse winding to keep front face toward +Z.
      shape.moveTo(0, bicepS / 2)
      shape.lineTo(-lenS, openS / 2)
      shape.lineTo(-lenS, -openS / 2)
      shape.lineTo(0, -bicepS / 2)
    }
    shape.closePath()

    return new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false })
  }, [side, bicepS, openS, lenS])

  // Attach at the side-seam x-position of the bodice
  const xPos = side === 'right' ? hw : -hw

  return (
    <mesh geometry={geometry} position={[xPos, yCentre, 0]}>
      <meshStandardMaterial color={color} roughness={0.8} metalness={0} />
    </mesh>
  )
}

// ─── Neckband (elliptical torus) ─────────────────────────────────────────────
// Positioned at the neck opening of the front bodice.
function NeckbandMesh({ params, color }: { params: TshirtParams; color: string }) {
  const neckW  = n(params.neck_width_mm, 190)
  const neckDF = n(params.neck_depth_front_mm, 80)
  const nbW    = n(params.neckband_finished_width_mm, 20)
  const bodyLen = n(params.body_length_hps_to_hem_mm, 700)

  const H    = bodyLen * S
  const nd   = neckDF * S
  const rx   = (neckW / 2) * S          // horizontal radius
  const ry   = nd * 0.5                  // vertical radius (half of neck depth)
  const tube = Math.max(0.5, nbW * S * 0.8)
  const avgR = (rx + ry) / 2

  if (rx <= 0 || ry <= 0 || avgR <= 0) return null

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const geometry = useMemo(
    () => new THREE.TorusGeometry(avgR, tube, 8, 48),
    [avgR, tube]
  )

  // Centre of neck opening in world Y: H/2 – nd/2
  const yPos = H / 2 - nd / 2

  return (
    <mesh
      geometry={geometry}
      position={[0, yPos, DEPTH / 2]}
      scale={[rx / avgR, ry / avgR, 1]}
    >
      <meshStandardMaterial color={color} roughness={0.5} metalness={0} />
    </mesh>
  )
}

// ─── Pocket plane ─────────────────────────────────────────────────────────────
function PocketMesh({ params, color }: { params: TshirtParams; color: string }) {
  if (!params.pocket_enabled || !params.pocket_width_mm || !params.pocket_height_mm) return null

  const bodyLen = n(params.body_length_hps_to_hem_mm, 700)
  const H   = bodyLen * S
  const pw  = n(params.pocket_width_mm, 100) * S
  const ph  = n(params.pocket_height_mm, 120) * S
  const pcf = n(params.pocket_placement_from_cf_mm, 70) * S
  const psh = n(params.pocket_placement_from_shoulder_mm, 130) * S

  // Pocket centre: pcf from centre-front (x), psh down from shoulder (y)
  const px = pcf
  const py = H / 2 - psh

  return (
    <mesh position={[px, py, DEPTH + 0.2]}>
      <planeGeometry args={[pw, ph]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────
function TshirtScene({ params }: { params: TshirtParams }) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.1
  })

  const bodyColor   = params.body_color_hex     || '#F5F0E8'
  const neckColor   = params.neckband_color_hex || '#1A1A1A'
  const pocketColor = params.pocket_color_hex   || bodyColor

  return (
    <group ref={groupRef}>
      <BodiceMesh params={params} isBack={false} color={bodyColor} />
      <BodiceMesh params={params} isBack={true}  color={bodyColor} />
      <SleeveMesh params={params} side="left"    color={bodyColor} />
      <SleeveMesh params={params} side="right"   color={bodyColor} />
      <NeckbandMesh params={params} color={neckColor} />
      {params.pocket_enabled && <PocketMesh params={params} color={pocketColor} />}
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
