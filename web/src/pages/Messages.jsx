import Layout from '../components/layout/Layout';
import Messenger from '../components/messenger/Messenger';

export default function Messages() {
  return (
    <Layout showFooter={false}>
      <div className="messages-page">
        <Messenger role="buyer" title="Messages" />
      </div>
    </Layout>
  );
}
