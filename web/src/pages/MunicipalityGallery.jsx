import React, { useEffect, useState } from 'react';
import { ArrowLeft, MapPin } from '@phosphor-icons/react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import './MunicipalityGallery.css';

export default function MunicipalityGallery() {
  const { id } = useParams();
  const [municipality, setMunicipality] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    axios.get(`/municipalities/${id}`)
      .then((response) => { if (!cancelled) setMunicipality(response.data); })
      .catch(() => { })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const gallery = Array.isArray(municipality?.gallery) ? municipality.gallery : [];
  const logo = municipality?.logo ? resolveImg(municipality.logo) : null;

  return (
    <Layout>
      <main className="municipality-gallery-page">
        <header className="municipality-gallery-header">
          <Link to={`/municipality/${id}`} className="municipality-gallery-back"><ArrowLeft size={16} /> Back to {municipality?.name || 'municipality'}</Link>
          <div className="municipality-gallery-title-row">
            <div className="municipality-gallery-title-logo">{logo ? <img src={logo} alt="" /> : <span>{municipality?.name?.charAt(0) || '?'}</span>}</div>
            <div><h1>{municipality?.name || 'Municipality'} Gallery</h1><p><MapPin size={15} /> Community images and stories</p></div>
          </div>
        </header>
        <div className="container municipality-gallery-content">
          {loading ? <div className="municipality-gallery-message">Loading gallery…</div> : gallery.length === 0 ? (
            <div className="municipality-gallery-message">No gallery images have been uploaded yet.</div>
          ) : (
            <div className="municipality-gallery-full-grid">
              {gallery.map((image, index) => <img key={`${image}-${index}`} src={resolveImg(image)} alt={`${municipality.name} gallery ${index + 1}`} />)}
            </div>
          )}
        </div>
      </main>
    </Layout>
  );
}
