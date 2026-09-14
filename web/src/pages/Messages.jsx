import React from 'react';
import Layout from '../components/layout/Layout';
import Messenger from '../components/messenger/Messenger';

export default function Messages() {
  return (
    <Layout showFooter={false}>
      <div className="messages-page">
        <h1 className="messages-page-title">Messages</h1>
        <Messenger role="buyer" />
      </div>
    </Layout>
  );
}
