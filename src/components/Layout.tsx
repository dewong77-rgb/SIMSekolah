import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Header from './Header'
import Footer from './Footer'

export default function Layout() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <>
      <a href="#isi" className="lewati">Lewati ke isi</a>
      <Header />
      <main id="isi">
        <Outlet />
      </main>
      <Footer />
    </>
  )
}
