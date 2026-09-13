import Hero from "@/components/Hero";
import CategoryCards from "@/components/CategoryCards";
import NewProjects from "@/components/NewProjects";
import Stats from "@/components/Stats";
import Testimonials from "@/components/Testimonials";
import FAQ from "@/components/FAQ";
import PopularSearches from "@/components/PopularSearches";

export default function Home() {
  return (
    <>
      <Hero />
      <CategoryCards />
      <NewProjects />
      <Stats />
      <Testimonials />
      <FAQ />
      <PopularSearches />
    </>
  );
}