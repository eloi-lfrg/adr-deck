import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('./views/ReviewLayout.vue'),
      children: [
        { path: '', name: 'grid', component: () => import('./views/GridView.vue') },
        { path: 'revue', name: 'slideshow', component: () => import('./views/SlideshowView.vue') },
        { path: 'recap', name: 'recap', component: () => import('./views/RecapView.vue') },
        { path: 'timeline', name: 'timeline', component: () => import('./views/TimelineView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
