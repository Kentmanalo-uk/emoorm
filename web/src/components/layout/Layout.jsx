import React from 'react';
import Header from './Header';
import Footer from './Footer';
import './Layout.css';

const Layout = ({ children, showFooter = true }) => {
  return (
    <div className="layout">
      <Header />
      <main className="layout-main">{children}</main>
      {showFooter && <Footer />}
    </div>
  );
};

export default Layout;
