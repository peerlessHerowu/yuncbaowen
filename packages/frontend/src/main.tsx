import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#22272e',
            color: '#e6edf3',
            border: '1px solid #373e47',
            borderRadius: '10px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#4ade80', secondary: '#22272e' } },
          error:   { iconTheme: { primary: '#f87171', secondary: '#22272e' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
)
