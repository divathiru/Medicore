import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar.jsx'
import ChatWidget from '../../components/ChatWidget.jsx'
import { doctorsApi } from '../../api/doctors.js'

const DEPARTMENTS = [
  { icon: '❤️', name: 'Cardiology', desc: 'Advanced cardiac care — from prevention to interventional procedures and heart failure management.' },
  { icon: '🧠', name: 'Neurology', desc: 'Comprehensive neurological care for movement disorders, stroke recovery, and Parkinson\'s disease.' },
  { icon: '🫁', name: 'Pulmonology', desc: 'Respiratory health management, sleep disorders, and chronic lung disease treatment programs.' },
  { icon: '🦴', name: 'Orthopedics', desc: 'Joint replacement, sports medicine, and musculoskeletal rehabilitation.' },
  { icon: '👁️', name: 'Ophthalmology', desc: 'Complete eye care — from routine vision exams to advanced surgical procedures.' },
  { icon: '🧬', name: 'Oncology', desc: 'Multidisciplinary cancer care with personalized treatment plans and palliative support.' },
]

const AVATAR_MAP = {
  'Cardiology': '👩‍⚕️',
  'Neurology': '👨‍⚕️',
}

function HeroSection() {
  return (
    <section className="hero">
      <div className="container hero-content">
        <div className="hero-badge">
          <span style={{ color: 'var(--teal-300)' }}>●</span>
          Advanced Healthcare Platform
        </div>
        <h1>
          Where Compassion<br />
          Meets <span>Cutting-Edge</span><br />
          Medicine
        </h1>
        <p>
          MediCore brings world-class specialists, AI-powered patient records,
          and seamless appointment booking together in one platform — so you can
          focus on what matters most: your health.
        </p>
        <div className="hero-actions">
          <Link to="/signup" className="btn btn-accent btn-lg">Book an Appointment</Link>
          <a href="#departments" className="btn btn-lg" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}>
            Our Departments
          </a>
        </div>
        <div className="hero-stats">
          {[
            ['500+', 'Patients Served'],
            ['12+', 'Years of Excellence'],
            ['8', 'Departments'],
            ['24/7', 'AI-Powered Support'],
          ].map(([val, lbl]) => (
            <div className="hero-stat" key={lbl}>
              <div className="hero-stat-value">{val}</div>
              <div className="hero-stat-label">{lbl}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function DepartmentsSection() {
  return (
    <section className="section" id="departments" style={{ background: 'var(--neutral-50)' }}>
      <div className="container">
        <div className="section-header">
          <div className="section-tag">Our Services</div>
          <h2>World-Class Departments</h2>
          <p>Specialist care across every major medical field, backed by leading physicians and state-of-the-art technology.</p>
        </div>
        <div className="card-grid">
          {DEPARTMENTS.map((d) => (
            <div className="dept-card" key={d.name}>
              <div className="dept-icon">{d.icon}</div>
              <h3>{d.name}</h3>
              <p>{d.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function DoctorsSection() {
  const { data: doctors, isLoading } = useQuery({
    queryKey: ['public-doctors'],
    queryFn: doctorsApi.listDoctors,
  })

  return (
    <section className="section" id="doctors" style={{ background: 'var(--white)' }}>
      <div className="container">
        <div className="section-header">
          <div className="section-tag">Our Team</div>
          <h2>Meet Our Specialists</h2>
          <p>Internationally trained physicians committed to excellence in patient care and medical innovation.</p>
        </div>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--neutral-400)' }}>Loading doctors…</div>
        ) : (
          <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {(doctors || []).map((doc) => (
              <div className="doctor-card" key={doc.id}>
                <div className="doctor-card-img">
                  <span style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))' }}>
                    {AVATAR_MAP[doc.department] || '🩺'}
                  </span>
                </div>
                <div className="doctor-card-body">
                  <div className="doctor-card-name">{doc.full_name}</div>
                  <div className="doctor-card-dept">{doc.department}</div>
                  <div className="doctor-card-exp">
                    🏅 {doc.experience_years} years of experience
                  </div>
                  <div className="doctor-card-bio">{doc.bio}</div>
                  <div style={{ marginTop: '1rem' }}>
                    <Link to="/signup" className="btn btn-primary btn-sm">
                      Book Appointment
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function AboutSection() {
  return (
    <section className="section" id="about" style={{ background: 'var(--navy-800)', color: '#fff' }}>
      <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
        <div>
          <div className="section-tag" style={{ color: 'var(--teal-400)' }}>About MediCore</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', color: '#fff', marginBottom: '1.5rem' }}>
            AI-Powered Healthcare for the Modern Age
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '1.0625rem', lineHeight: 1.75, marginBottom: '1.5rem' }}>
            MediCore integrates advanced RAG-based AI with your medical history, giving your doctor
            instant access to relevant context — so every consultation is informed by the full picture of your health.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              ['🔒', 'Privacy-first architecture — your records, scoped to your care team only'],
              ['🤖', 'AI assistant answers questions from your actual medical history'],
              ['📋', 'Seamless prescription and appointment lifecycle management'],
            ].map(([icon, text]) => (
              <div key={text} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{icon}</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9375rem' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {[
            ['teal', '99.9%', 'Uptime'],
            ['amber', '<2min', 'Avg Wait'],
            ['teal', '4.9★', 'Patient Rating'],
            ['amber', '100%', 'Data Encrypted'],
          ].map(([color, val, lbl]) => (
            <div key={lbl} className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: color === 'teal' ? 'var(--teal-400)' : 'var(--amber-400)', fontFamily: 'var(--font-display)' }}>{val}</div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ background: 'var(--navy-900)', color: 'rgba(255,255,255,0.5)', padding: '2rem 0', textAlign: 'center', fontSize: '0.875rem' }}>
      <div className="container">
        <span style={{ fontFamily: 'var(--font-display)', color: 'var(--teal-400)', fontWeight: 700, fontSize: '1.25rem' }}>MediCore</span>
        <br /><br />
        © 2025 MediCore Healthcare. All rights reserved. &nbsp;·&nbsp; Advanced Hospital Management Platform
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div>
      <Navbar />
      <HeroSection />
      <DepartmentsSection />
      <DoctorsSection />
      <AboutSection />
      <Footer />
      <ChatWidget />
    </div>
  )
}
