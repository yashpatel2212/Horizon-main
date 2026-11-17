import React from 'react'
import Header from './../Header/Header'
import Footer from './../Footer/Footer'
import Routers from '../router/Routers'
import TravelAssistant from '../TravelAssistant/TravelAssistant'

const Layout = () => {
  return (
    <>
     <Header/>
     <Routers />
     <Footer />
     <TravelAssistant />
    
    </>
  )
}

export default Layout
