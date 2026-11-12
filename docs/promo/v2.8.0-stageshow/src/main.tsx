import React from 'react'
import { createRoot } from 'react-dom/client'
import Gold from './gold'
import { Demo } from './demo'
import '../kit/stageshow.css'
import './demo.css'
const scene = new URLSearchParams(location.search).get('scene') || 'lookup'
createRoot(document.getElementById('root')!).render(scene === 'gold' ? <Gold/> : <Demo kind={scene==='panels'?'panels':'lookup'}/> )
