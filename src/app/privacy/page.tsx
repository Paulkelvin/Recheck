export const metadata = {
  title: "Privacy Policy — Land Scam Check",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-foreground">
        Privacy Policy
      </h1>
      <p className="mt-1 text-sm text-muted">Last updated: 12 August 2026</p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-6 text-muted">
        <section>
          <h2 className="mb-2 font-semibold text-foreground">
            1. What we collect
          </h2>
          <p>When you use Land Scam Check, we collect:</p>
          <ul className="ml-5 mt-2 list-disc">
            <li>Your name, email address, and phone number, when you create an account.</li>
            <li>
              Details about the land you ask us to check: state, LGA, address, survey plan
              number, and the seller&apos;s name.
            </li>
            <li>
              Documents you upload — survey plans, deeds, receipts, or anything else you
              choose to share to support your check.
            </li>
            <li>Payment confirmation from our payment processor (we never see or store your card details).</li>
            <li>
              If you list yourself as a surveyor, your registration number, firm name, and
              contact details.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-foreground">
            2. Why we collect it
          </h2>
          <p>
            We use this information only to run the Land Scam Check service: to carry out
            the checks you pay for, to let our partner surveyors and legal partners review
            your documents, to send you updates about your report&apos;s progress, and to
            maintain the surveyor directory. We do not sell your data, and we do not use it
            for advertising.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-foreground">
            3. Who sees your information
          </h2>
          <p>
            Your land documents and details are shared only with the partner surveyor
            and/or lawyer assigned to your check, and with our admin team. We do not share
            your personal data with the seller, the government, or any third party outside
            of what&apos;s needed to complete your check — for example, a partner surveyor
            checking a survey plan against a state land registry, or our payment processor
            (Paystack) confirming payment.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-foreground">
            4. How we store it
          </h2>
          <p>
            Account and report data is stored in a secured database. Uploaded documents are
            stored with Cloudinary, a third-party file storage provider. We keep your data
            for as long as your account is active, or as needed to resolve a dispute about a
            report.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-foreground">
            5. Your rights
          </h2>
          <p>
            Under the Nigeria Data Protection Act, you can ask us what data we hold about
            you, ask us to correct it, or ask us to delete your account and associated data
            (subject to any records we&apos;re required to keep). To do this, contact us
            using the details below.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-foreground">
            6. SURCON and third-party verification
          </h2>
          <p>
            Land Scam Check is not affiliated with, endorsed by, or an official channel of
            the Surveyors Council of Nigeria (SURCON) or any government land registry. Where
            we reference SURCON registration status, this reflects our own admin team&apos;s
            or partner surveyors&apos; best-effort verification, not an official SURCON
            determination.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-foreground">
            7. Contact
          </h2>
          <p>
            Questions about this policy or your data? Reach us through the contact details
            provided on our platform.
          </p>
        </section>
      </div>
    </div>
  );
}
