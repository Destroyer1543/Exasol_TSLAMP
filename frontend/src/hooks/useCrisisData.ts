import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { GraphData, CrisisDetail, Prediction, CrisisStory } from '../types'

export function useCrisisData() {
  const [graph,       setGraph]       = useState<GraphData | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [error,       setError]       = useState('')

  const fetchGraph = useCallback(async () => {
    try {
      const data = await api.graph()
      setGraph(data)
      setLastUpdated(new Date().toUTCString().slice(17, 25) + ' UTC')
      setError('')
    } catch (e) {
      setError('Backend unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGraph()
    // Refresh every 5 minutes
    const interval = setInterval(fetchGraph, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchGraph])

  return { graph, loading, error, lastUpdated, refetch: fetchGraph }
}

export function useCrisisDetail(id: string | null) {
  const [detail,      setDetail]      = useState<CrisisDetail | null>(null)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [story,       setStory]       = useState<CrisisStory | null>(null)
  const [briefing,    setBriefing]    = useState<string>('')
  const [loadingDetail,  setLoadingDetail]  = useState(false)
  const [loadingBriefing, setLoadingBriefing] = useState(false)

  useEffect(() => {
    if (!id) { setDetail(null); setPredictions([]); setStory(null); setBriefing(''); return }

    setLoadingDetail(true)
    setBriefing('')
    Promise.all([api.crisis(id), api.predictions(id), api.story(id)])
      .then(([d, p, s]) => {
        setDetail(d)
        setPredictions(p.predictions)
        setStory(s)
      })
      .catch(() => {})
      .finally(() => setLoadingDetail(false))
  }, [id])

  const generateBriefing = async () => {
    if (!id) return
    setLoadingBriefing(true)
    try {
      const res = await api.briefing(id)
      setBriefing(res.briefing)
    } catch {}
    finally { setLoadingBriefing(false) }
  }

  return { detail, predictions, story, briefing, loadingDetail, loadingBriefing, generateBriefing }
}
