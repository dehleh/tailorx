import Hero from '@/components/Hero';
import Logos from '@/components/Logos';
import Features from '@/components/Features';
import HowItWorks from '@/components/HowItWorks';
import UseCases from '@/components/UseCases';
import Pricing from '@/components/Pricing';
import Testimonial from '@/components/Testimonial';
import Waitlist from '@/components/Waitlist';
import FAQ from '@/components/FAQ';
import Footer from '@/components/Footer';
import Nav from '@/components/Nav';

export default function Page() {
  return (
    <main>
      <Nav />
      <Hero />
      <Logos />
      <Features />
      <HowItWorks />
      <UseCases />
      <Pricing />
      <Testimonial />
      <Waitlist />
      <FAQ />
      <Footer />
    </main>
  );
}
