import React from 'react';
import CatalogDetailClient from './CatalogDetailClient';

// For static export, generate a placeholder page
// Real catalog IDs are handled client-side
export async function generateStaticParams() {
  return [{ id: '1' }];
}

export default function CatalogDetailPage() {
  return <CatalogDetailClient />;
}