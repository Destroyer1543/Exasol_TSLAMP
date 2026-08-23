import { useEffect, useRef, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'
import type { CrisisType, Severity, RelationshipType } from '../../types'
import { CRISIS_COLOR, SEV_RADIUS, REL_COLOR } from '../../types'

interface MapNode {
  id: string
  title: string
  type: CrisisType
  severity: Severity
  lat: number
  lon: number
  country: string
}

interface MapEdge {
  source_id: string
  target_id: string
  relationship: RelationshipType
}

interface Props {
  crises: MapNode[]
  edges: MapEdge[]
  selectedId: string | null
  onSelect: (id: string) => void
}

const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry',           stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#4b5563' }] },
  { featureType: 'road',               stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road',  elementType: 'geometry',           stylers: [{ color: '#1e2a3a' }] },
  { featureType: 'road',  elementType: 'labels.text.fill',   stylers: [{ color: '#4b5563' }] },
  { featureType: 'water', elementType: 'geometry',           stylers: [{ color: '#060b13' }] },
  { featureType: 'water', elementType: 'labels.text.fill',   stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',            stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1e2a3a' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#374151' }] },
]

/** Spread overlapping markers in a circle so they don't stack on top of each other. */
function computeMarkerPositions(crises: MapNode[]): Map<string, { lat: number; lon: number }> {
  // Group nodes that round to the same 1-degree bucket
  const buckets = new Map<string, MapNode[]>()
  crises.forEach(c => {
    const key = `${c.lat.toFixed(1)},${c.lon.toFixed(1)}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(c)
  })

  const positions = new Map<string, { lat: number; lon: number }>()
  buckets.forEach(group => {
    if (group.length === 1) {
      positions.set(group[0].id, { lat: group[0].lat, lon: group[0].lon })
    } else {
      group.forEach((node, i) => {
        // Spiral outwards so each extra node in the same spot gets its own offset
        const angle  = (i * 2 * Math.PI / group.length) - Math.PI / 2
        const radius = 0.9 + Math.floor(i / group.length) * 0.5  // ~100 km spread
        positions.set(node.id, {
          lat: node.lat + radius * Math.cos(angle),
          lon: node.lon + radius * Math.sin(angle),
        })
      })
    }
  })
  return positions
}

export default function GlobalMap({ crises, edges, selectedId, onSelect }: Props) {
  const mapRef          = useRef<HTMLDivElement>(null)
  const mapObjRef       = useRef<google.maps.Map | null>(null)
  const markersRef      = useRef<Map<string, google.maps.Marker>>(new Map())
  const polylinesRef    = useRef<google.maps.Polyline[]>([])
  const markerPosRef    = useRef<Map<string, { lat: number; lon: number }>>(new Map())
  const [mapError, setMapError] = useState('')
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!key) { setMapError('Set VITE_GOOGLE_MAPS_API_KEY'); return }

    new Loader({ apiKey: key, version: 'weekly' }).load().then(() => {
      if (!mapRef.current) return
      mapObjRef.current = new google.maps.Map(mapRef.current, {
        center: { lat: 20, lng: 10 },
        zoom: 2.5,
        mapTypeId: 'roadmap',
        styles: DARK_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
        backgroundColor: '#07090f',
      })
      setMapReady(true)
    }).catch(e => setMapError(String(e)))
  }, [])

  // Sync markers
  useEffect(() => {
    if (!mapReady || !mapObjRef.current) return
    const map = mapObjRef.current

    // Compute spread positions for overlapping nodes
    const positions = computeMarkerPositions(crises)
    markerPosRef.current = positions

    const currentIds = new Set(crises.map(c => c.id))

    // Remove stale markers
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) { marker.setMap(null); markersRef.current.delete(id) }
    })

    crises.forEach(crisis => {
      const color  = CRISIS_COLOR[crisis.type]
      const radius = SEV_RADIUS[crisis.severity]
      const isSelected  = crisis.id === selectedId
      const isConnected = selectedId && selectedId !== crisis.id && edges.some(
        e => (e.source_id === selectedId && e.target_id === crisis.id) ||
             (e.target_id === selectedId && e.source_id === crisis.id)
      )
      const dimmed   = selectedId && !isSelected && !isConnected
      const opacity  = dimmed ? '0.18' : '1'
      const glowSize = isSelected ? radius + 6 : isConnected ? radius + 3 : 0

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${radius * 2 + 18}" height="${radius * 2 + 18}">
        ${crisis.severity === 'CRITICAL' ? `<circle cx="${radius + 9}" cy="${radius + 9}" r="${radius + 6}" fill="${color}15" />` : ''}
        ${glowSize > 0 ? `<circle cx="${radius + 9}" cy="${radius + 9}" r="${glowSize}" fill="none" stroke="${isSelected ? '#fff' : color}" stroke-width="${isSelected ? 2.5 : 1.5}" opacity="0.9"/>` : ''}
        <circle cx="${radius + 9}" cy="${radius + 9}" r="${radius}" fill="${color}33" stroke="${color}" stroke-width="${isSelected ? 2.5 : 1.5}" opacity="${opacity}" />
      </svg>`

      const pos = positions.get(crisis.id) ?? { lat: crisis.lat, lon: crisis.lon }

      if (markersRef.current.has(crisis.id)) {
        const m = markersRef.current.get(crisis.id)!
        m.setPosition({ lat: pos.lat, lng: pos.lon })
        m.setIcon({ url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, anchor: new google.maps.Point(radius + 9, radius + 9) })
        m.setZIndex(isSelected ? 100 : isConnected ? 50 : 1)
        return
      }

      const marker = new google.maps.Marker({
        position: { lat: pos.lat, lng: pos.lon },
        map,
        title: crisis.title,
        icon: { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, anchor: new google.maps.Point(radius + 9, radius + 9) },
        zIndex: isSelected ? 100 : 1,
      })

      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="background:#0d1117;padding:10px 12px;border-radius:8px;max-width:220px;font-family:Inter,sans-serif">
          <div style="font-size:10px;color:${color};font-weight:700;margin-bottom:4px">${crisis.type.replace(/_/g, ' ')} · ${crisis.severity}</div>
          <div style="font-size:12px;color:#e6edf3;font-weight:600;margin-bottom:4px">${crisis.title}</div>
          <div style="font-size:11px;color:#7d8590">${crisis.country}</div>
        </div>`,
      })

      marker.addListener('mouseover', () => infoWindow.open(map, marker))
      marker.addListener('mouseout',  () => infoWindow.close())
      marker.addListener('click',     () => onSelect(crisis.id))
      markersRef.current.set(crisis.id, marker)
    })
  }, [crises, selectedId, onSelect, mapReady, edges])

  // Draw connection polylines when a node is selected
  useEffect(() => {
    if (!mapReady || !mapObjRef.current) return
    polylinesRef.current.forEach(p => p.setMap(null))
    polylinesRef.current = []
    if (!selectedId) return

    const selected = crises.find(c => c.id === selectedId)
    if (!selected) return

    const selectedPos = markerPosRef.current.get(selectedId) ?? { lat: selected.lat, lon: selected.lon }

    edges
      .filter(e => e.source_id === selectedId || e.target_id === selectedId)
      .forEach(edge => {
        const otherId = edge.source_id === selectedId ? edge.target_id : edge.source_id
        const other   = crises.find(c => c.id === otherId)
        if (!other) return

        const otherPos = markerPosRef.current.get(otherId) ?? { lat: other.lat, lon: other.lon }
        const color    = REL_COLOR[edge.relationship] ?? '#4b5563'

        const line = new google.maps.Polyline({
          path: [
            { lat: selectedPos.lat, lng: selectedPos.lon },
            { lat: otherPos.lat,    lng: otherPos.lon    },
          ],
          map: mapObjRef.current!,
          strokeColor: color,
          strokeOpacity: 0.75,
          strokeWeight: 2,
          icons: [{
            icon: {
              path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 3.5,
              fillColor: color,
              fillOpacity: 1,
              strokeWeight: 0,
            },
            offset: '100%',
          }],
        })
        polylinesRef.current.push(line)
      })
  }, [selectedId, edges, crises, mapReady])

  if (mapError) return (
    <div className="w-full h-full flex items-center justify-center bg-surface text-dim text-sm">{mapError}</div>
  )

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />
      {selectedId && (
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 bg-surface/80 backdrop-blur px-3 py-2 rounded-lg border border-border">
          {Object.entries(REL_COLOR).map(([rel, color]) => (
            <div key={rel} className="flex items-center gap-1 text-[9px] text-dim">
              <div className="w-4 h-px" style={{ background: color }} />{rel}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
