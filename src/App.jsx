import React from 'react';

function App() {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      fontFamily: 'sans-serif'
    }}>
      <h1 style={{ color: '#007bff' }}>CareerClub 起動テスト</h1>
      <p>この画面が表示されていれば、VercelとReactの設定は正常です！</p>
      <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <p>もし元の画面が真っ白だったなら、原因は以下のいずれかです：</p>
        <ul style={{ textAlign: 'left' }}>
          <li>FirebaseのAPIキーがVercel上で正しく反映されていない</li>
          <li>Firebaseのデータ取得（Firestore）でエラーが起きている</li>
          <li>インポートしているCSSファイルが見つからない</li>
        </ul>
      </div>
    </div>
  );
}

export default App;
