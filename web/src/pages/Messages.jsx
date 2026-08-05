import React from 'react';
import Layout from '../components/layout/Layout';
import Messenger from '../components/messenger/Messenger';

export default function Messages() {
  return (
    <Layout showFooter={false}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 20px' }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#111827',
            margin: '0 0 16px',
          }}
        >
          Messages
        </h1>
        <Messenger role="buyer" />
      </div>
    </Layout>
  );
}
