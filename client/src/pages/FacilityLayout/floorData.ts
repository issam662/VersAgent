// Floor plan images — displayed as-is, no filter

export interface FloorPlan {
  id: string;
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  viewBox: string;
}

export const floorPlans: Record<string, FloorPlan> = {
  'floor-ground': {
    id: 'floor-ground',
    imageSrc: '/layouts/ground-floor.jpg',
    imageWidth: 1024,
    imageHeight: 768,
    // Tight crop to the building content (skip whitespace above/below)
    viewBox: '40 240 870 370',
  },
  'floor-site': {
    id: 'floor-site',
    imageSrc: '/layouts/site-plan.jpg',
    imageWidth: 1024,
    imageHeight: 768,
    // Tight crop to the campus content
    viewBox: '10 80 990 620',
  },
};
