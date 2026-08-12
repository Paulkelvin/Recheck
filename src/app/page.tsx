import Link from "next/link";

const fears = [
  "Is this survey plan real?",
  "Has this land been sold to someone else?",
  "Can the government take this land back?",
  "Is anyone else claiming this land?",
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col items-center gap-12 px-6 py-24 text-center">
        <div className="flex flex-col items-center gap-4">
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            Land Scam Check
          </span>
          <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            Before you pay for that land — make sure it&apos;s not fake, not
            already sold to someone else, and not something the government
            can take back.
          </h1>
          <p className="max-w-lg text-lg text-zinc-600 dark:text-zinc-400">
            A quick check before you hand over your money, so you don&apos;t
            find out the hard way.
          </p>
        </div>

        <ul className="grid w-full gap-3 text-left sm:grid-cols-2">
          {fears.map((fear) => (
            <li
              key={fear}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
            >
              {fear}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <Link
            className="flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            href="/check"
          >
            Check my land
          </Link>
          <Link
            className="flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-6 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            href="/directory"
          >
            Find a licensed surveyor
          </Link>
        </div>
      </main>
    </div>
  );
}
