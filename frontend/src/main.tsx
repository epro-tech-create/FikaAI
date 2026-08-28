import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { currentApplication } from './lib/application'
import { initGoogleAnalytics } from './lib/analytics'
import './styles.css'

initGoogleAnalytics()

const application = currentApplication()
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App application={application} /></BrowserRouter></React.StrictMode>)
